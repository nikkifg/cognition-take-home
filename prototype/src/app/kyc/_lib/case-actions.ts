import type { KycCaseStatus } from "@/generated/prisma/enums";
import { defineAction } from "@/platform/actions";
import { requestApproval } from "@/platform/approvals";
import { ForbiddenError } from "@/platform/errors";
import { can } from "@/platform/rbac";
import { CaseStateError } from "./errors";
import { caseSnapshot } from "./snapshot";

export const DECISIONS = ["APPROVE", "REJECT", "ESCALATE"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Handler key and approver permission for the high-risk second review. */
export const SECOND_REVIEW = "kyc.case.approve_high_risk";

/** OPEN cases are claimable by analysts; ESCALATED ones need kyc.escalation.claim. */
export const CLAIMABLE: KycCaseStatus[] = ["OPEN", "ESCALATED"];

export const claimCase = defineAction({
  name: "kyc.case.claim",
  app: "kyc",
  permission: "kyc.case.claim",
  run: async (ctx, input: { caseId: string }) => {
    const { tx, actor } = ctx;
    const before = await tx.kycCase.findUnique({ where: { id: input.caseId } });
    if (!before) throw new CaseStateError("Case not found");
    if (before.claimedById) {
      throw new CaseStateError(
        before.claimedById === actor.id ? "You already claimed this case" : "Case is already claimed by another reviewer",
      );
    }
    if (!CLAIMABLE.includes(before.status)) throw new CaseStateError(`Case is ${before.status}`);
    if (before.status === "ESCALATED" && !can(actor, "kyc.escalation.claim")) {
      throw new ForbiddenError("kyc.escalation.claim");
    }

    // Conditional update so two concurrent claims can't both win.
    const { count } = await tx.kycCase.updateMany({
      where: { id: before.id, status: before.status, claimedById: null },
      data: { status: "IN_REVIEW", claimedById: actor.id, claimedAt: new Date() },
    });
    if (count !== 1) throw new CaseStateError("Case is already claimed by another reviewer");

    const after = await tx.kycCase.findUniqueOrThrow({ where: { id: before.id } });
    await ctx.audit({ entityType: "KycCase", entityId: before.id, before: caseSnapshot(before), after: caseSnapshot(after) });
    return after;
  },
});

export const decideCase = defineAction({
  name: "kyc.case.decide",
  app: "kyc",
  permission: "kyc.case.decide",
  run: async (ctx, input: { caseId: string; decision: Decision; reason: string }) => {
    const { tx, actor } = ctx;
    const reason = input.reason?.trim();
    if (!DECISIONS.includes(input.decision)) throw new CaseStateError("Unknown decision");
    if (!reason) throw new CaseStateError("A reason is required");

    const before = await tx.kycCase.findUnique({
      where: { id: input.caseId },
      include: { applicant: { select: { riskLevel: true } } },
    });
    if (!before) throw new CaseStateError("Case not found");
    if (before.status !== "IN_REVIEW") throw new CaseStateError(`Case is ${before.status}`);
    if (before.claimedById !== actor.id) {
      throw new CaseStateError("Only the reviewer who claimed the case can decide it");
    }

    const highRiskApproval = input.decision === "APPROVE" && before.applicant.riskLevel === "HIGH";
    const data =
      highRiskApproval
        ? { status: "PENDING_SECOND_REVIEW" as const, decisionReason: reason }
        : input.decision === "ESCALATE"
          ? { status: "ESCALATED" as const, decisionReason: reason, claimedById: null, claimedAt: null }
          : {
              status: input.decision === "APPROVE" ? ("APPROVED" as const) : ("REJECTED" as const),
              decisionReason: reason,
              decidedById: actor.id,
              decidedAt: new Date(),
            };

    const after = await tx.kycCase.update({
      where: { id: before.id, status: "IN_REVIEW", claimedById: actor.id },
      data,
    });
    await ctx.audit({
      entityType: "KycCase",
      entityId: before.id,
      before: caseSnapshot(before),
      after: { ...caseSnapshot(after), decision: input.decision },
      reason,
    });

    if (highRiskApproval) {
      // Four-eyes: decideApproval blocks the requester (this reviewer) from approving.
      const request = await requestApproval(ctx, {
        app: "kyc",
        action: SECOND_REVIEW,
        payload: { caseId: before.id },
        summary: `Approve high-risk case ${before.reference}`,
        approverPermission: SECOND_REVIEW,
        requiredApprovals: 1,
        entityType: "KycCase",
        entityId: before.id,
      });
      return { case: after, approvalRequestId: request.id };
    }
    return { case: after, approvalRequestId: null };
  },
});
