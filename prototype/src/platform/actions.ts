import { db } from "@/lib/db";
import { writeAudit } from "./audit";
import { PolicyError } from "./errors";
import { requirePermission } from "./rbac";
import type { Actor } from "./roles";
import type { ActionContext, Permission } from "./types";

export type ActionDefinition<I, O> = {
  /** e.g. "kyc.case.claim". Used as the default audit action. */
  name: string;
  app: string;
  /** Required permission, or a function of the input (e.g. per-field). */
  permission: Permission | ((input: I) => Permission);
  run: (ctx: ActionContext, input: I) => Promise<O>;
};

/** The only sanctioned way to change data. Declare with defineAction, call with runAction. */
export function defineAction<I, O>(def: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return def;
}

/**
 * Checks the permission, runs the action in a transaction and requires at
 * least one audit event. Policy failures are audited as `action.denied`.
 */
export async function runAction<I, O>(
  action: ActionDefinition<I, O>,
  actor: Actor,
  input: I,
): Promise<O> {
  try {
    const permission =
      typeof action.permission === "function" ? action.permission(input) : action.permission;
    requirePermission(actor, permission);

    return await db.$transaction(async (tx) => {
      let audited = 0;
      const ctx: ActionContext = {
        tx,
        actor,
        audit: async (event) => {
          audited++;
          await writeAudit(tx, { ...event, actor, action: event.action ?? action.name, app: event.app ?? action.app });
        },
      };
      const result = await action.run(ctx, input);
      if (audited === 0) {
        throw new Error(`Action ${action.name} completed without writing an audit event`);
      }
      return result;
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      await writeAudit(db, {
        actor,
        action: "action.denied",
        app: err.app ?? action.app,
        reason: `${action.name}: ${err.message}`,
      });
    }
    throw err;
  }
}
