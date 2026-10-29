import type { Prisma } from "@/generated/prisma/client";
import type { Actor, Role } from "./roles";

/** Prisma client inside an action's transaction. */
export type Tx = Prisma.TransactionClient;

export type Permission = string;

export type AuditInput = {
  /** Defaults to the running action's name. */
  action?: string;
  /** Defaults to the running action's app. */
  app?: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

export type ActionContext = {
  tx: Tx;
  actor: Actor;
  /** Append an audit event in the same transaction as the change. */
  audit: (event: AuditInput) => Promise<void>;
};

export type ApprovalHandler = (
  ctx: ActionContext,
  payload: unknown,
  request: { id: string; requestedById: string },
) => Promise<void>;

export type SensitiveField = {
  label: string;
  /** Permission required to reveal the full value. */
  permission: Permission;
  read: (client: Tx, entityId: string) => Promise<string | null>;
  /** Defaults to showing the last 4 characters. */
  mask?: (value: string) => string;
};

export type AppDefinition = {
  /** Also the required prefix for this app's permission names. */
  id: string;
  name: string;
  description: string;
  href: string;
  status: "live" | "planned";
  /** Permission needed to see the app in navigation and open it. */
  viewPermission: Permission;
  /** Permission name -> roles granted it. Names must start with `${id}.`. */
  permissions: Record<Permission, { description: string; roles: Role[] }>;
  sensitiveFields?: Record<string, SensitiveField>;
  /** Run when an ApprovalRequest with this `action` key is fully approved. */
  approvalHandlers?: Record<string, ApprovalHandler>;
  /** Optional: run when a request with this `action` key is rejected. */
  rejectionHandlers?: Record<string, ApprovalHandler>;
};
