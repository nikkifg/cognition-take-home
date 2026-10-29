import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "@/lib/db";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { ForbiddenError, PolicyError, SelfApprovalError } from "@/platform/errors";
import type { Actor } from "@/platform/roles";
import { claimCase, decideCase } from "@/app/kyc/_lib/case-actions";
import { CaseStateError } from "@/app/kyc/_lib/errors";
import { auditFor, makeKycCase, makeUser } from "./fixtures";

let analyst: Actor, analyst2: Actor, senior: Actor, senior2: Actor, support: Actor, admin: Actor;

before(async () => {
  [analyst, analyst2, senior, senior2, support, admin] = await Promise.all([
    makeUser("compliance_analyst"),
    makeUser("compliance_analyst"),
    makeUser("compliance_senior_reviewer"),
    makeUser("compliance_senior_reviewer"),
    makeUser("support_agent"),
    makeUser("admin"),
  ]);
});

after(() => db.$disconnect());

const getCase = (id: string) => db.kycCase.findUniqueOrThrow({ where: { id } });
const pendingRequestFor = (caseId: string) =>
  db.approvalRequest.findFirstOrThrow({ where: { entityType: "KycCase", entityId: caseId, status: "PENDING" } });

async function claimed(risk: "LOW" | "MEDIUM" | "HIGH", by: Actor) {
  const c = await makeKycCase(risk);
  await runAction(claimCase, by, { caseId: c.id });
  return c;
}

describe("KYC claim rule", () => {
  it("claiming an open case assigns it to the reviewer and audits before/after", async () => {
    const c = await makeKycCase("LOW");

    await runAction(claimCase, analyst, { caseId: c.id });

    const stored = await getCase(c.id);
    assert.equal(stored.status, "IN_REVIEW");
    assert.equal(stored.claimedById, analyst.id);
    const [event] = await auditFor(c.id);
    assert.equal(event.action, "kyc.case.claim");
    assert.equal(event.actorId, analyst.id);
    assert.deepEqual(JSON.parse(event.before!), { status: "OPEN", claimedById: null, decisionReason: null, decidedById: null });
    assert.equal(JSON.parse(event.after!).claimedById, analyst.id);
  });

  it("a claimed case can't be claimed by someone else", async () => {
    const c = await claimed("LOW", analyst);

    for (const other of [analyst2, senior]) {
      await assert.rejects(runAction(claimCase, other, { caseId: c.id }), (e) => {
        assert.ok(e instanceof CaseStateError);
        assert.equal(e.status, 403);
        return true;
      });
    }

    const stored = await getCase(c.id);
    assert.equal(stored.claimedById, analyst.id);
    const denied = await db.auditEvent.findFirst({
      where: { actorId: analyst2.id, action: "action.denied", reason: { contains: "already claimed" } },
    });
    assert.ok(denied, "blocked claim is audited");
  });

  it("only one of two concurrent claims wins", async () => {
    const c = await makeKycCase("LOW");

    const results = await Promise.allSettled([
      runAction(claimCase, analyst, { caseId: c.id }),
      runAction(claimCase, analyst2, { caseId: c.id }),
    ]);

    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const claims = (await auditFor(c.id)).filter((e) => e.action === "kyc.case.claim");
    assert.equal(claims.length, 1);
  });

  it("roles without kyc.case.claim are rejected (403)", async () => {
    const c = await makeKycCase("LOW");
    for (const actor of [support, admin]) {
      await assert.rejects(runAction(claimCase, actor, { caseId: c.id }), ForbiddenError);
    }
    assert.equal((await getCase(c.id)).claimedById, null);
  });

  it("only the reviewer who claimed a case can decide it", async () => {
    const c = await claimed("LOW", analyst);
    await assert.rejects(
      runAction(decideCase, analyst2, { caseId: c.id, decision: "APPROVE", reason: "looks fine" }),
      CaseStateError,
    );
    assert.equal((await getCase(c.id)).status, "IN_REVIEW");
  });

  it("an unclaimed case can't be decided", async () => {
    const c = await makeKycCase("LOW");
    await assert.rejects(
      runAction(decideCase, analyst, { caseId: c.id, decision: "REJECT", reason: "no" }),
      CaseStateError,
    );
  });

  it("escalating releases the claim; only a senior reviewer can claim the escalated case", async () => {
    const c = await claimed("MEDIUM", analyst);
    await runAction(decideCase, analyst, { caseId: c.id, decision: "ESCALATE", reason: "Document glare (Test)" });

    const escalated = await getCase(c.id);
    assert.equal(escalated.status, "ESCALATED");
    assert.equal(escalated.claimedById, null);

    await assert.rejects(runAction(claimCase, analyst2, { caseId: c.id }), ForbiddenError);
    await runAction(claimCase, senior, { caseId: c.id });
    assert.equal((await getCase(c.id)).claimedById, senior.id);
  });
});

describe("KYC decisions", () => {
  it("requires a reason", async () => {
    const c = await claimed("LOW", analyst);
    await assert.rejects(
      runAction(decideCase, analyst, { caseId: c.id, decision: "REJECT", reason: "   " }),
      /reason is required/,
    );
    assert.equal((await getCase(c.id)).status, "IN_REVIEW");
  });

  it("low/medium-risk approve and reject apply directly with an audited reason", async () => {
    const approved = await claimed("LOW", analyst);
    const rejected = await claimed("MEDIUM", analyst);

    const a = await runAction(decideCase, analyst, { caseId: approved.id, decision: "APPROVE", reason: "ID verified" });
    await runAction(decideCase, analyst, { caseId: rejected.id, decision: "REJECT", reason: "Document failed" });

    assert.equal(a.approvalRequestId, null);
    assert.equal((await getCase(approved.id)).status, "APPROVED");
    assert.equal((await getCase(approved.id)).decidedById, analyst.id);
    assert.equal((await getCase(rejected.id)).status, "REJECTED");
    const decision = (await auditFor(rejected.id)).find((e) => e.action === "kyc.case.decide");
    assert.equal(decision?.reason, "Document failed");
  });

  it("audit events for a case never contain the applicant's SSN", async () => {
    const c = await claimed("HIGH", analyst);
    await runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "ok" });
    const { applicant } = await db.kycCase.findUniqueOrThrow({ where: { id: c.id }, include: { applicant: true } });
    const events = await db.auditEvent.findMany();
    assert.ok(!JSON.stringify(events).includes(applicant.ssn));
  });
});

describe("KYC four-eyes rule (high-risk cases)", () => {
  it("approving a high-risk case requests a second review instead of approving", async () => {
    const c = await claimed("HIGH", analyst);

    const result = await runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "Docs consistent" });

    const stored = await getCase(c.id);
    assert.equal(stored.status, "PENDING_SECOND_REVIEW");
    assert.equal(stored.decidedById, null);
    const request = await pendingRequestFor(c.id);
    assert.equal(request.id, result.approvalRequestId);
    assert.equal(request.requestedById, analyst.id);
    assert.equal(request.approverPermission, "kyc.case.approve_high_risk");
  });

  it("the first reviewer can't give the second approval", async () => {
    const c = await claimed("HIGH", senior);
    await runAction(decideCase, senior, { caseId: c.id, decision: "APPROVE", reason: "Docs consistent" });
    const request = await pendingRequestFor(c.id);

    await assert.rejects(
      runAction(decideApproval, senior, { requestId: request.id, decision: "APPROVE", comment: "me again" }),
      SelfApprovalError,
    );

    assert.equal((await getCase(c.id)).status, "PENDING_SECOND_REVIEW");
    const denied = await db.auditEvent.findFirst({
      where: { actorId: senior.id, action: "action.denied", reason: { contains: "own request" } },
    });
    assert.ok(denied, "blocked self-approval is audited");
  });

  it("an analyst can't give the second approval", async () => {
    const c = await claimed("HIGH", analyst);
    await runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "ok" });
    const request = await pendingRequestFor(c.id);

    await assert.rejects(
      runAction(decideApproval, analyst2, { requestId: request.id, decision: "APPROVE" }),
      ForbiddenError,
    );
    assert.equal((await getCase(c.id)).status, "PENDING_SECOND_REVIEW");
  });

  it("a different senior reviewer's approval approves the case", async () => {
    const c = await claimed("HIGH", senior);
    await runAction(decideCase, senior, { caseId: c.id, decision: "APPROVE", reason: "Docs consistent" });
    const request = await pendingRequestFor(c.id);

    const result = await runAction(decideApproval, senior2, { requestId: request.id, decision: "APPROVE", comment: "Agree" });

    assert.equal(result.status, "APPROVED");
    const stored = await getCase(c.id);
    assert.equal(stored.status, "APPROVED");
    assert.equal(stored.claimedById, senior.id);
    assert.equal(stored.decidedById, senior2.id);
    assert.notEqual(stored.claimedById, stored.decidedById);
    const actions = (await auditFor(c.id)).map((e) => e.action);
    assert.deepEqual(actions, ["kyc.case.claim", "kyc.case.decide", "kyc.case.second_review_approved"]);
  });

  it("a rejected second review sends the case back to the first reviewer", async () => {
    const c = await claimed("HIGH", analyst);
    await runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "ok" });
    const request = await pendingRequestFor(c.id);

    await runAction(decideApproval, senior, { requestId: request.id, decision: "REJECT", comment: "Check address" });

    const stored = await getCase(c.id);
    assert.equal(stored.status, "IN_REVIEW");
    assert.equal(stored.claimedById, analyst.id);
    assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "REJECTED");
    await runAction(decideCase, analyst, { caseId: c.id, decision: "REJECT", reason: "Address mismatch" });
    assert.equal((await getCase(c.id)).status, "REJECTED");
  });

  it("a case awaiting second review can't be decided again by the first reviewer", async () => {
    const c = await claimed("HIGH", analyst);
    await runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "ok" });
    await assert.rejects(
      runAction(decideCase, analyst, { caseId: c.id, decision: "APPROVE", reason: "again" }),
      (e) => e instanceof PolicyError,
    );
    assert.equal((await getCase(c.id)).status, "PENDING_SECOND_REVIEW");
  });
});
