// Flag rules shared by server code and the UI. No server-only imports here.
import type { Environment } from "@/generated/prisma/enums";

export const ENVIRONMENTS: readonly Environment[] = ["dev", "staging", "prod"];

/** Environments engineers change directly; prod goes through approval. */
export const NONPROD: readonly Environment[] = ["dev", "staging"];

/** Approval handler key for a prod change. */
export const PROD_CHANGE = "flags.prod.apply";

export const isEnvironment = (v: unknown): v is Environment =>
  typeof v === "string" && (ENVIRONMENTS as readonly string[]).includes(v);

export const onOff = (enabled: boolean) => (enabled ? "on" : "off");

/** Stored as the ApprovalRequest payload; applied by the approval handler. */
export type ProdChangePayload = {
  valueId: string;
  flagId: string;
  key: string;
  fromEnabled: boolean;
  toEnabled: boolean;
  reason: string;
};

/** Audit snapshot of a flag value. */
export const valueSnapshot = (
  key: string,
  v: { environment: Environment; enabled: boolean; updatedById: string | null },
) => ({ key, environment: v.environment, enabled: v.enabled, updatedById: v.updatedById });
