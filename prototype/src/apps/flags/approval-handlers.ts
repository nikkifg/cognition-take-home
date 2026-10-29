// Approval handler for prod flag changes, registered in apps.config.ts. Only
// reachable through decideApproval. Imports types, errors and policy only.
import { SelfApprovalError } from "@/platform/errors";
import type { ActionContext } from "@/platform/types";
import { FlagStateError } from "./errors";
import { PROD_CHANGE, valueSnapshot, type ProdChangePayload } from "./policy";

export async function applyProdChange(ctx: ActionContext, payload: unknown) {
  const p = payload as ProdChangePayload;
  const { tx, actor } = ctx;
  const before = await tx.flagValue.findUnique({ where: { id: p.valueId } });
  if (!before || before.environment !== "prod") throw new FlagStateError("Flag value not found");
  if (before.enabled !== p.fromEnabled) {
    throw new FlagStateError("The prod value changed since this request; reject it and request again");
  }
  // decideApproval marks the request APPROVED before calling the handler; this
  // is the approved request for this value that hasn't been applied yet.
  const request = await tx.approvalRequest.findFirst({
    where: { app: "flags", action: PROD_CHANGE, entityId: before.id, status: "APPROVED", flagChanges: { none: {} } },
    orderBy: { resolvedAt: "desc" },
  });
  if (!request) throw new FlagStateError("Approved request not found");
  if (request.requestedById === actor.id) throw new SelfApprovalError();

  const { count } = await tx.flagValue.updateMany({
    where: { id: before.id, enabled: p.fromEnabled },
    data: { enabled: p.toEnabled, updatedById: request.requestedById },
  });
  if (count !== 1) throw new FlagStateError("The prod value changed since this request");
  const after = await tx.flagValue.findUniqueOrThrow({ where: { id: before.id } });

  await tx.flagChange.create({
    data: {
      flagId: before.flagId,
      environment: "prod",
      fromEnabled: before.enabled,
      toEnabled: after.enabled,
      reason: p.reason,
      changedById: request.requestedById,
      approvalRequestId: request.id,
    },
  });
  await ctx.audit({
    action: "flags.prod.applied",
    app: "flags",
    entityType: "FlagValue",
    entityId: before.id,
    before: valueSnapshot(p.key, before),
    after: valueSnapshot(p.key, after),
    reason: p.reason,
  });
}
