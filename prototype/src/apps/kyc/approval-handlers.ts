// Approval handlers for the high-risk second review, registered in
// apps.config.ts. Only reachable through decideApproval.
import { SelfApprovalError } from "@/platform/errors";
import type { ActionContext } from "@/platform/types";
import { CaseStateError } from "./errors";
import { caseSnapshot } from "./snapshot";

type Payload = { caseId: string };

async function pendingCase(ctx: ActionContext, payload: unknown) {
  const { caseId } = payload as Payload;
  const before = await ctx.tx.kycCase.findUnique({ where: { id: caseId } });
  if (!before || before.status !== "PENDING_SECOND_REVIEW") {
    throw new CaseStateError("Case is not awaiting a second review");
  }
  return before;
}

export async function applySecondApproval(ctx: ActionContext, payload: unknown) {
  const before = await pendingCase(ctx, payload);
  if (before.claimedById === ctx.actor.id) throw new SelfApprovalError();
  const after = await ctx.tx.kycCase.update({
    where: { id: before.id },
    data: { status: "APPROVED", decidedById: ctx.actor.id, decidedAt: new Date() },
  });
  await ctx.audit({
    action: "kyc.case.second_review_approved",
    app: "kyc",
    entityType: "KycCase",
    entityId: before.id,
    before: caseSnapshot(before),
    after: caseSnapshot(after),
  });
}

/** A rejected second review sends the case back to the reviewer who claimed it. */
export async function returnAfterSecondReviewRejected(ctx: ActionContext, payload: unknown) {
  const before = await pendingCase(ctx, payload);
  const after = await ctx.tx.kycCase.update({
    where: { id: before.id },
    data: { status: "IN_REVIEW", decisionReason: null },
  });
  await ctx.audit({
    action: "kyc.case.second_review_rejected",
    app: "kyc",
    entityType: "KycCase",
    entityId: before.id,
    before: caseSnapshot(before),
    after: caseSnapshot(after),
  });
}
