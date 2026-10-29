// Approval handler for prod flag changes, registered in apps.config.ts. Only
// reachable through decideApproval. Imports types, errors and policy only.
import { SelfApprovalError } from "@/platform/errors";
import type { ActionContext } from "@/platform/types";
import { FlagStateError } from "./errors";
import { valueSnapshot, type ProdChangePayload } from "./policy";

export async function applyProdChange(
  ctx: ActionContext,
  payload: unknown,
  request: { id: string; requestedById: string },
) {
  const p = payload as ProdChangePayload;
  const { tx, actor } = ctx;
  const before = await tx.flagValue.findUnique({ where: { id: p.valueId } });
  if (!before || before.environment !== "prod") throw new FlagStateError("Flag value not found");
  if (before.enabled !== p.fromEnabled) {
    throw new FlagStateError("The prod value changed since this request; reject it and request again");
  }
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
