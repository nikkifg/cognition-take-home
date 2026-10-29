import type { Environment } from "@/generated/prisma/enums";
import { defineAction } from "@/platform/actions";
import { requestApproval } from "@/platform/approvals";
import type { Tx } from "@/platform/types";
import { FlagStateError } from "./errors";
import { NONPROD, onOff, PROD_CHANGE, valueSnapshot, type ProdChangePayload } from "./policy";

async function findValue(tx: Tx, flagId: string, environment: Environment) {
  const value = await tx.flagValue.findUnique({
    where: { flagId_environment: { flagId, environment } },
    include: { flag: { select: { key: true } } },
  });
  if (!value) throw new FlagStateError("Flag value not found");
  return value;
}

/** Dev/staging: applies directly and records a FlagChange. */
export const setNonprodValue = defineAction({
  name: "flags.value.set",
  app: "flags",
  permission: "flags.update_nonprod",
  run: async (ctx, input: { flagId: string; environment: Environment; enabled: boolean; reason?: string }) => {
    const { tx, actor } = ctx;
    if (!NONPROD.includes(input.environment)) {
      throw new FlagStateError("Prod changes need approval; request one instead");
    }
    const before = await findValue(tx, input.flagId, input.environment);
    if (before.enabled === input.enabled) {
      throw new FlagStateError(`${before.flag.key} is already ${onOff(input.enabled)} in ${input.environment}`);
    }

    const { count } = await tx.flagValue.updateMany({
      where: { id: before.id, enabled: before.enabled },
      data: { enabled: input.enabled, updatedById: actor.id },
    });
    if (count !== 1) throw new FlagStateError("Flag was changed by someone else; reload and try again");

    const after = await tx.flagValue.findUniqueOrThrow({ where: { id: before.id } });
    const reason = input.reason?.trim() || null;
    await tx.flagChange.create({
      data: {
        flagId: input.flagId,
        environment: input.environment,
        fromEnabled: before.enabled,
        toEnabled: after.enabled,
        reason,
        changedById: actor.id,
      },
    });
    await ctx.audit({
      entityType: "FlagValue",
      entityId: before.id,
      before: valueSnapshot(before.flag.key, before),
      after: valueSnapshot(before.flag.key, after),
      reason: reason ?? undefined,
    });
    return after;
  },
});

/** Prod: creates an approval request; the value changes only when another engineer approves. */
export const requestProdChange = defineAction({
  name: "flags.prod.request",
  app: "flags",
  permission: "flags.request_prod",
  run: async (ctx, input: { flagId: string; enabled: boolean; reason: string }) => {
    const { tx } = ctx;
    const reason = input.reason?.trim();
    if (!reason) throw new FlagStateError("A reason is required");

    const value = await findValue(tx, input.flagId, "prod");
    if (value.enabled === input.enabled) {
      throw new FlagStateError(`${value.flag.key} is already ${onOff(input.enabled)} in prod`);
    }
    const pending = await tx.approvalRequest.findFirst({
      where: { app: "flags", action: PROD_CHANGE, entityType: "FlagValue", entityId: value.id, status: "PENDING" },
    });
    if (pending) throw new FlagStateError(`A prod change for ${value.flag.key} is already waiting for approval`);

    const payload: ProdChangePayload = {
      valueId: value.id,
      flagId: input.flagId,
      key: value.flag.key,
      fromEnabled: value.enabled,
      toEnabled: input.enabled,
      reason,
    };
    return requestApproval(ctx, {
      app: "flags",
      action: PROD_CHANGE,
      payload,
      summary: `Turn ${value.flag.key} ${onOff(input.enabled)} in prod: ${reason}`,
      approverPermission: "flags.approve_prod",
      requiredApprovals: 1,
      entityType: "FlagValue",
      entityId: value.id,
    });
  },
});
