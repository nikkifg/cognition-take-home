import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { db } from "@/lib/db";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { ForbiddenError, SelfApprovalError } from "@/platform/errors";
import type { Actor } from "@/platform/roles";
import { revealField } from "@/platform/sensitive";
import { processRefund, requestRefund } from "@/apps/refunds/actions";
import { RefundStateError } from "@/apps/refunds/errors";
import { MockPaymentProcessor, setPaymentProcessorForTesting } from "@/apps/refunds/processor";
import { auditFor, makeTransaction, makeUser } from "./fixtures";

let support: Actor, finance1: Actor, finance2: Actor, admin: Actor;
let processor: MockPaymentProcessor;

before(async () => {
  [support, finance1, finance2, admin] = await Promise.all([
    makeUser("support_agent"),
    makeUser("finance_approver"),
    makeUser("finance_approver"),
    makeUser("admin"),
  ]);
});

beforeEach(() => {
  processor = new MockPaymentProcessor();
  setPaymentProcessorForTesting(processor);
});

after(() => db.$disconnect());

const refundOf = (id: string) => db.refundRequest.findUniqueOrThrow({ where: { id } });
const txnStatus = async (id: string) => (await db.transaction.findUniqueOrThrow({ where: { id } })).status;
const approvalFor = (refundId: string) =>
  db.approvalRequest.findFirst({ where: { app: "refunds", entityId: refundId } });

const request = (actor: Actor, txnId: string) =>
  runAction(requestRefund, actor, { transactionId: txnId, reasonCode: "CUSTOMER_REQUEST" });

async function approve(refundId: string, approver: Actor) {
  const approval = (await approvalFor(refundId))!;
  await runAction(decideApproval, approver, { requestId: approval.id, decision: "APPROVE" });
}

/** Request a refund for a new transaction (it waits for approval). */
async function requested_(actor: Actor, amountCents: number) {
  const txn = await makeTransaction(amountCents);
  return { txn, requested: await request(actor, txn.id) };
}

/** Request, approve by another finance approver, then process: the full dashboard flow. */
async function refund(actor: Actor, amountCents: number) {
  const r = await requested_(actor, amountCents);
  await approve(r.requested.id, actor.id === finance1.id ? finance2 : finance1);
  const final = await runAction(processRefund, finance1, { refundId: r.requested.id });
  return { ...r, final };
}

describe("Refunds: every refund needs approval", () => {
  for (const amountCents of [1, 50_00, 99_99, 100_00, 400_00]) {
    it(`${amountCents} cents waits for approval and does not call the processor`, async () => {
      const { txn, requested: r } = await requested_(support, amountCents);
      assert.equal(r.status, "PENDING_APPROVAL");
      const approval = await approvalFor(r.id);
      assert.equal(approval?.status, "PENDING");
      assert.equal(approval?.approverPermission, "refunds.approve");
      assert.equal(await txnStatus(txn.id), "REFUND_PENDING");
      await assert.rejects(runAction(processRefund, support, { refundId: r.id }), RefundStateError);
      assert.equal(processor.calls, 0);
    });
  }

  it("a finance approver approves; the refund then executes", async () => {
    const { requested } = await refund(support, 400_00);
    const final = await refundOf(requested.id);
    assert.equal(final.status, "SUCCEEDED");
    assert.match(final.processorRef ?? "", /^mockpay_re_/);
    assert.equal((await approvalFor(requested.id))?.status, "APPROVED");
    assert.equal(await txnStatus(requested.transactionId), "REFUNDED");
    assert.equal(processor.refundsCreated, 1);
    const actions = (await auditFor(requested.id)).map((e) => e.action);
    assert.deepEqual(actions, ["refunds.refund.request", "refunds.refund.approved", "refunds.refund.process"]);
  });

  it("a support agent cannot approve", async () => {
    const { requested } = await requested_(finance1, 400_00);
    const approval = (await approvalFor(requested.id))!;
    await assert.rejects(runAction(decideApproval, support, { requestId: approval.id, decision: "APPROVE" }), ForbiddenError);
    assert.equal((await refundOf(requested.id)).status, "PENDING_APPROVAL");
  });

  it("a rejection closes the refund and releases the transaction", async () => {
    const { txn, requested } = await requested_(support, 250_00);
    const approval = (await approvalFor(requested.id))!;
    await runAction(decideApproval, finance1, { requestId: approval.id, decision: "REJECT", comment: "outside policy" });
    assert.equal((await refundOf(requested.id)).status, "REJECTED");
    assert.equal(await txnStatus(txn.id), "SETTLED");
    assert.equal(processor.calls, 0);
  });
});

describe("Refunds: self-approval", () => {
  it("a finance approver cannot approve their own request", async () => {
    const { requested } = await requested_(finance1, 400_00);
    const approval = (await approvalFor(requested.id))!;

    await assert.rejects(
      runAction(decideApproval, finance1, { requestId: approval.id, decision: "APPROVE" }),
      SelfApprovalError,
    );
    assert.equal((await refundOf(requested.id)).status, "PENDING_APPROVAL");
    assert.equal(processor.calls, 0);

    await runAction(decideApproval, finance2, { requestId: approval.id, decision: "APPROVE" });
    assert.equal((await refundOf(requested.id)).status, "PENDING");
  });
});

describe("Refunds: double refund", () => {
  it("a refunded transaction can't be refunded again", async () => {
    const { txn } = await refund(support, 50_00);
    await assert.rejects(
      runAction(requestRefund, support, { transactionId: txn.id, reasonCode: "DUPLICATE_CHARGE" }),
      RefundStateError,
    );
    assert.equal(await db.refundRequest.count({ where: { transactionId: txn.id } }), 1);
    const denied = await db.auditEvent.findFirst({
      where: { actorId: support.id, action: "action.denied", reason: { contains: txn.reference } },
    });
    assert.ok(denied, "blocked double refund is audited");
  });

  it("a transaction awaiting approval can't get a second refund request", async () => {
    const { txn } = await requested_(support, 400_00);
    await assert.rejects(
      runAction(requestRefund, finance1, { transactionId: txn.id, reasonCode: "FRAUD" }),
      RefundStateError,
    );
    assert.equal(await db.refundRequest.count({ where: { transactionId: txn.id } }), 1);
  });

  it("concurrent requests for the same transaction create one refund", async () => {
    const txn = await makeTransaction(30_00);
    const results = await Promise.allSettled(
      [support, finance1, finance2].map((a) =>
        runAction(requestRefund, a, { transactionId: txn.id, reasonCode: "CUSTOMER_REQUEST" }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await db.refundRequest.count({ where: { transactionId: txn.id } }), 1);
  });

  it("a processed refund can't be sent to the processor again", async () => {
    const { final } = await refund(support, 20_00);
    await assert.rejects(runAction(processRefund, support, { refundId: final.id }), RefundStateError);
    assert.equal(processor.calls, 1);
  });
});

describe("Refunds: idempotency", () => {
  it("the same idempotency key yields exactly one processor refund", async () => {
    const call = { idempotencyKey: "idem-test-same", chargeReference: "TXN-TEST-IDEM", amountCents: 12_00, currency: "USD" };
    const first = await processor.refund(call);
    const second = await processor.refund(call);
    assert.deepEqual(second, first);
    assert.equal(processor.calls, 2);
    assert.equal(processor.refundsCreated, 1);
    await assert.rejects(processor.refund({ ...call, amountCents: 13_00 }), /different parameters/);
  });

  it("a retry after a crash reuses the key and does not double-refund", async () => {
    const { txn, requested: pending } = await requested_(support, 75_00);
    await approve(pending.id, finance1);
    // The processor refunded, but the app crashed before recording it.
    const lost = await processor.refund({
      idempotencyKey: pending.idempotencyKey,
      chargeReference: txn.reference,
      amountCents: txn.amountCents,
      currency: txn.currency,
    });
    assert.equal((await refundOf(pending.id)).status, "PENDING");

    const retried = await runAction(processRefund, support, { refundId: pending.id });
    assert.equal(retried.status, "SUCCEEDED");
    assert.equal(retried.processorRef, lost.id);
    assert.equal(processor.refundsCreated, 1);
  });

  it("each refund request gets its own key", async () => {
    const a = await refund(support, 10_00);
    const b = await refund(support, 10_00);
    assert.notEqual(a.final.idempotencyKey, b.final.idempotencyKey);
    assert.equal(processor.refundsCreated, 2);
  });
});

describe("Refunds: processor failure", () => {
  it("a declined refund is FAILED and the transaction is refundable again", async () => {
    const { txn, final } = await refund(support, 42_13);
    assert.equal(final.status, "FAILED");
    assert.match(final.failureReason ?? "", /declined/);
    assert.equal(await txnStatus(txn.id), "SETTLED");
    const retry = await request(support, txn.id);
    assert.equal(retry.status, "PENDING_APPROVAL");
    assert.notEqual(retry.idempotencyKey, final.idempotencyKey);
  });
});

describe("Refunds: access and audit", () => {
  it("admin can view but not request refunds", async () => {
    const txn = await makeTransaction(10_00);
    await assert.rejects(
      runAction(requestRefund, admin, { transactionId: txn.id, reasonCode: "OTHER" }),
      ForbiddenError,
    );
    assert.equal(await db.refundRequest.count({ where: { transactionId: txn.id } }), 0);
  });

  it("admin cannot send a refund to the processor", async () => {
    const { requested: r } = await requested_(support, 10_00);
    await approve(r.id, finance1);
    await assert.rejects(runAction(processRefund, admin, { refundId: r.id }), ForbiddenError);
    assert.equal((await refundOf(r.id)).status, "PENDING");
    assert.equal(processor.calls, 0);
  });

  it("requires a valid reason code", async () => {
    const txn = await makeTransaction(10_00);
    await assert.rejects(
      runAction(requestRefund, support, { transactionId: txn.id, reasonCode: "BOGUS" as never }),
      /reason code/,
    );
    assert.equal(await txnStatus(txn.id), "SETTLED");
  });

  it("audits the request with before/after and never the customer email", async () => {
    const { txn, requested } = await requested_(support, 15_00);
    const events = await auditFor(requested.id);
    assert.equal(events[0].action, "refunds.refund.request");
    assert.equal(events[0].actorId, support.id);
    assert.deepEqual(JSON.parse(events[0].before!), { transactionId: txn.id, transactionStatus: "SETTLED" });
    assert.equal(JSON.parse(events[0].after!).reasonCode, "CUSTOMER_REQUEST");
    for (const e of events) assert.ok(!JSON.stringify(e).includes(txn.customerEmail));
  });

  it("customer email reveal needs permission and is audited", async () => {
    const txn = await makeTransaction(10_00);
    const ref = { app: "refunds", field: "transaction.customerEmail", entityId: txn.id };
    assert.equal(await runAction(revealField, support, ref), txn.customerEmail);
    await assert.rejects(runAction(revealField, admin, ref), ForbiddenError);
    const [event] = await auditFor(txn.id);
    assert.equal(event.action, "field.reveal");
    assert.ok(!JSON.stringify(event).includes(txn.customerEmail));
  });
});
