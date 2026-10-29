import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "@/lib/db";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { ForbiddenError, SelfApprovalError } from "@/platform/errors";
import type { Actor } from "@/platform/roles";
import { revealField } from "@/platform/sensitive";
import { requestBankChange } from "@/apps/payouts/actions";
import { PayoutChangeError } from "@/apps/payouts/errors";
import { auditFor, makePayee, makeUser } from "./fixtures";

let finance1: Actor, finance2: Actor, admin: Actor, engineer: Actor;

before(async () => {
  [finance1, finance2, admin, engineer] = await Promise.all([
    makeUser("finance_admin"),
    makeUser("finance_admin"),
    makeUser("admin"),
    makeUser("engineer"),
  ]);
});

after(() => db.$disconnect());

let acct = 0;
/** Fresh synthetic account number (0000-prefixed, never real). */
const newAccount = () => `0000${String(77_000_000 + ++acct)}`;

const details = (accountNumber = newAccount()) => ({
  bankName: "Fourth Test Bank (Test)",
  routingNumber: "000000999",
  accountNumber,
  reason: "Vendor switched banks (test)",
});

const payeeOf = (id: string) => db.payee.findUniqueOrThrow({ where: { id } });
const changeOf = (id: string) => db.bankAccountChange.findUniqueOrThrow({ where: { id } });
const approvalFor = async (changeId: string) =>
  (await db.approvalRequest.findFirst({ where: { app: "payouts", entityId: changeId } }))!;

async function requested(actor: Actor = finance1, accountNumber?: string) {
  const payee = await makePayee();
  const input = { payeeId: payee.id, ...details(accountNumber) };
  const change = await runAction(requestBankChange, actor, input);
  return { payee, change, input };
}

const decide = async (changeId: string, actor: Actor, decision: "APPROVE" | "REJECT") =>
  runAction(decideApproval, actor, {
    requestId: (await approvalFor(changeId)).id,
    decision,
    comment: "verified by phone (test)",
  });

describe("Payouts: every bank account change needs approval", () => {
  it("requesting a change does not apply it and holds the payee", async () => {
    const { payee, change } = await requested();
    assert.equal(change.status, "PENDING_APPROVAL");
    const now = await payeeOf(payee.id);
    assert.equal(now.accountNumber, payee.accountNumber);
    assert.equal(now.routingNumber, payee.routingNumber);
    assert.equal(now.status, "CHANGE_PENDING");
    const approval = await approvalFor(change.id);
    assert.equal(approval.status, "PENDING");
    assert.equal(approval.approverPermission, "payouts.bank_change.approve");
  });

  it("the requester can't approve their own change", async () => {
    const { payee, change } = await requested(finance1);
    await assert.rejects(decide(change.id, finance1, "APPROVE"), SelfApprovalError);
    assert.equal((await changeOf(change.id)).status, "PENDING_APPROVAL");
    assert.equal((await payeeOf(payee.id)).accountNumber, payee.accountNumber);
    const denied = await db.auditEvent.findFirst({
      where: { actorId: finance1.id, action: "action.denied", app: "payouts", reason: { contains: "own request" } },
    });
    assert.ok(denied, "self-approval attempt is audited under the payouts app");
  });

  it("roles without the approver permission can't approve", async () => {
    const { change } = await requested();
    for (const actor of [admin, engineer]) {
      await assert.rejects(decide(change.id, actor, "APPROVE"), ForbiddenError);
    }
    assert.equal((await changeOf(change.id)).status, "PENDING_APPROVAL");
  });

  it("a different finance admin's approval switches the payee to the new account", async () => {
    const { payee, change, input } = await requested(finance1);
    const result = await decide(change.id, finance2, "APPROVE");
    assert.equal(result.status, "APPROVED");
    const now = await payeeOf(payee.id);
    assert.equal(now.accountNumber, input.accountNumber);
    assert.equal(now.routingNumber, input.routingNumber);
    assert.equal(now.bankName, input.bankName);
    assert.equal(now.status, "ACTIVE");
    assert.equal((await changeOf(change.id)).status, "APPROVED");
    assert.equal((await changeOf(change.id)).oldAccountNumber, payee.accountNumber);
  });

  it("a rejection keeps the current account and releases the hold", async () => {
    const { payee, change } = await requested(finance1);
    await decide(change.id, finance2, "REJECT");
    const now = await payeeOf(payee.id);
    assert.equal(now.accountNumber, payee.accountNumber);
    assert.equal(now.status, "ACTIVE");
    assert.equal((await changeOf(change.id)).status, "REJECTED");
    // A new request is accepted after the rejection.
    const retry = await runAction(requestBankChange, finance1, { payeeId: payee.id, ...details() });
    assert.equal(retry.status, "PENDING_APPROVAL");
  });
});

describe("Payouts: one pending change per payee", () => {
  it("a payee with a pending change rejects a second request", async () => {
    const { payee } = await requested(finance1);
    await assert.rejects(
      runAction(requestBankChange, finance2, { payeeId: payee.id, ...details() }),
      PayoutChangeError,
    );
    assert.equal(await db.bankAccountChange.count({ where: { payeeId: payee.id } }), 1);
  });

  it("concurrent requests for the same payee create one change", async () => {
    const payee = await makePayee();
    const results = await Promise.allSettled(
      [finance1, finance2, finance1].map((a) =>
        runAction(requestBankChange, a, { payeeId: payee.id, ...details() }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await db.bankAccountChange.count({ where: { payeeId: payee.id } }), 1);
    assert.equal(await db.approvalRequest.count({ where: { app: "payouts", status: "PENDING", summary: { contains: payee.reference } } }), 1);
  });
});

describe("Payouts: validation", () => {
  const cases: [string, Partial<ReturnType<typeof details>>, RegExp][] = [
    ["short routing number", { routingNumber: "12345" }, /Routing number/],
    ["non-numeric account number", { accountNumber: "12ab5678" }, /Account number/],
    ["missing bank name", { bankName: " " }, /Bank name/],
    ["missing reason", { reason: "" }, /reason/],
  ];
  for (const [name, override, message] of cases) {
    it(`rejects a ${name} without holding the payee`, async () => {
      const payee = await makePayee();
      await assert.rejects(
        runAction(requestBankChange, finance1, { payeeId: payee.id, ...details(), ...override }),
        message,
      );
      assert.equal((await payeeOf(payee.id)).status, "ACTIVE");
      assert.equal(await db.bankAccountChange.count({ where: { payeeId: payee.id } }), 0);
    });
  }

  it("rejects a change to the account the payee already uses", async () => {
    const payee = await makePayee();
    await assert.rejects(
      runAction(requestBankChange, finance1, {
        payeeId: payee.id,
        ...details(payee.accountNumber),
        routingNumber: payee.routingNumber,
      }),
      PayoutChangeError,
    );
  });
});

describe("Payouts: access and audit", () => {
  it("admin and engineer can't request a change; the denial is audited", async () => {
    const payee = await makePayee();
    for (const actor of [admin, engineer]) {
      await assert.rejects(runAction(requestBankChange, actor, { payeeId: payee.id, ...details() }), ForbiddenError);
      const denied = await db.auditEvent.findFirst({
        where: { actorId: actor.id, action: "action.denied", app: "payouts" },
      });
      assert.ok(denied);
    }
    assert.equal((await payeeOf(payee.id)).status, "ACTIVE");
    assert.equal(await db.bankAccountChange.count({ where: { payeeId: payee.id } }), 0);
  });

  it("audits request and approval with before/after and never an account number", async () => {
    const { payee, change, input } = await requested(finance1);
    await decide(change.id, finance2, "APPROVE");
    const approval = await approvalFor(change.id);
    const events = [
      ...(await auditFor(change.id)),
      ...(await auditFor(approval.id)),
    ];
    assert.deepEqual(
      events.map((e) => e.action),
      ["payouts.bank_change.request", "payouts.bank_change.approved", "approval.requested", "approval.approved"],
    );
    const [req, applied] = events;
    assert.equal(req.actorId, finance1.id);
    assert.deepEqual(JSON.parse(req.before!), {
      payeeId: payee.id,
      payeeStatus: "ACTIVE",
      bankName: payee.bankName,
      routingNumber: payee.routingNumber,
    });
    assert.equal(JSON.parse(req.after!).payeeStatus, "CHANGE_PENDING");
    assert.equal(applied.actorId, finance2.id);
    assert.equal(JSON.parse(applied.after!).routingNumber, input.routingNumber);

    const everything = JSON.stringify(events) + approval.payload + approval.summary;
    for (const secret of [payee.accountNumber, input.accountNumber]) {
      assert.ok(!everything.includes(secret), "account numbers never reach the audit log or approval request");
    }
  });

  it("account number reveal needs permission and is audited without the value", async () => {
    const { payee, change, input } = await requested(finance1);
    const current = { app: "payouts", field: "payee.accountNumber", entityId: payee.id };
    const proposed = { app: "payouts", field: "change.newAccountNumber", entityId: change.id };
    assert.equal(await runAction(revealField, finance2, current), payee.accountNumber);
    assert.equal(await runAction(revealField, finance2, proposed), input.accountNumber);
    await assert.rejects(runAction(revealField, admin, current), ForbiddenError);
    const reveals = (await auditFor(payee.id)).filter((e) => e.action === "field.reveal");
    assert.equal(reveals.length, 1);
    assert.equal(reveals[0].actorId, finance2.id);
    assert.ok(!JSON.stringify(reveals).includes(payee.accountNumber));
  });
});
