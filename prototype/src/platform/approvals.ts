import { defineAction } from "./actions";
import { ApprovalStateError, ForbiddenError, SelfApprovalError } from "./errors";
import { can } from "./rbac";
import { getApp } from "./registry";
import type { ActionContext, Permission } from "./types";

export type ApprovalRequestInput = {
  /** Handler key in the app's `approvalHandlers`. */
  action: string;
  payload: unknown;
  summary: string;
  approverPermission: Permission;
  /** Distinct approvers needed, none of them the requester. Default 1. */
  requiredApprovals?: number;
  entityType?: string;
  entityId?: string;
  /** Defaults to the app of the calling action's audit context. */
  app: string;
};

/**
 * Call inside an action instead of applying a change that needs sign-off.
 * The change is applied by the app's approval handler once approved.
 */
export async function requestApproval(ctx: ActionContext, input: ApprovalRequestInput) {
  if (!getApp(input.app)?.approvalHandlers?.[input.action]) {
    throw new Error(`No approval handler "${input.action}" registered for app "${input.app}"`);
  }
  const request = await ctx.tx.approvalRequest.create({
    data: {
      app: input.app,
      action: input.action,
      payload: JSON.stringify(input.payload),
      summary: input.summary,
      approverPermission: input.approverPermission,
      requiredApprovals: Math.max(1, input.requiredApprovals ?? 1),
      entityType: input.entityType,
      entityId: input.entityId,
      requestedById: ctx.actor.id,
    },
  });
  await ctx.audit({
    action: "approval.requested",
    app: input.app,
    entityType: "ApprovalRequest",
    entityId: request.id,
    after: { action: input.action, payload: input.payload, requiredApprovals: request.requiredApprovals },
    reason: input.summary,
  });
  return request;
}

export const decideApproval = defineAction({
  name: "approval.decide",
  app: "platform",
  permission: "approvals.decide",
  run: async (
    ctx,
    input: { requestId: string; decision: "APPROVE" | "REJECT"; comment?: string },
  ) => {
    const { tx, actor } = ctx;
    const request = await tx.approvalRequest.findUnique({
      where: { id: input.requestId },
      include: { decisions: true },
    });
    if (!request) throw new ApprovalStateError("Approval request not found");
    if (request.status !== "PENDING") throw new ApprovalStateError(`Request is ${request.status}`);
    if (request.requestedById === actor.id) throw new SelfApprovalError();
    if (!can(actor, request.approverPermission)) {
      throw new ForbiddenError(request.approverPermission);
    }
    if (request.decisions.some((d) => d.approverId === actor.id)) {
      throw new ApprovalStateError("You already decided this request");
    }

    await tx.approvalDecision.create({
      data: { requestId: request.id, approverId: actor.id, decision: input.decision, comment: input.comment },
    });

    const approvals = request.decisions.filter((d) => d.decision === "APPROVE").length +
      (input.decision === "APPROVE" ? 1 : 0);
    const status =
      input.decision === "REJECT" ? "REJECTED" : approvals >= request.requiredApprovals ? "APPROVED" : "PENDING";

    if (status !== "PENDING") {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: { status, resolvedAt: new Date() },
      });
    }
    await ctx.audit({
      action: input.decision === "APPROVE" ? "approval.approved" : "approval.rejected",
      app: request.app,
      entityType: "ApprovalRequest",
      entityId: request.id,
      before: { status: request.status },
      after: { status, approvals, requiredApprovals: request.requiredApprovals },
      reason: input.comment,
    });

    if (status === "APPROVED") {
      const handler = getApp(request.app)?.approvalHandlers?.[request.action];
      if (!handler) throw new Error(`No approval handler "${request.action}" for "${request.app}"`);
      await handler(ctx, JSON.parse(request.payload));
    }
    if (status === "REJECTED") {
      await getApp(request.app)?.rejectionHandlers?.[request.action]?.(ctx, JSON.parse(request.payload));
    }
    return { status, approvals };
  },
});
