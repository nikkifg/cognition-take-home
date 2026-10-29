import { listApps } from "./registry";
import { ForbiddenError } from "./errors";
import type { Actor, Role } from "./roles";
import type { Permission } from "./types";

/** Permissions owned by the platform itself (not any one app). */
export const PLATFORM_PERMISSIONS: Record<Permission, { description: string; roles: Role[] }> = {
  "audit.view": {
    description: "View every app's audit events (apps grant their own via `<appId>.audit.view`)",
    roles: ["admin"],
  },
  "approvals.decide": {
    description: "Decide approval requests (the request's own permission is also required)",
    roles: ["compliance_senior_reviewer", "finance_admin", "engineer"],
  },
};

export function permissionCatalog(): Record<Permission, { description: string; roles: Role[] }> {
  return Object.assign({}, PLATFORM_PERMISSIONS, ...listApps().map((a) => a.permissions));
}

export function rolesFor(permission: Permission): Role[] {
  return permissionCatalog()[permission]?.roles ?? [];
}

/** Deny by default: unknown permissions are never granted. */
export function can(actor: Pick<Actor, "role"> | null | undefined, permission: Permission): boolean {
  return !!actor && rolesFor(permission).includes(actor.role);
}

export function requirePermission(actor: Actor | null | undefined, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

/**
 * Apps whose audit events the actor may see: "all" with `audit.view`,
 * otherwise each app whose `<appId>.audit.view` they hold. Platform events
 * (sign-ins, platform denials) are only visible with `audit.view`.
 */
export function auditScope(actor: Pick<Actor, "role"> | null | undefined): "all" | string[] {
  if (can(actor, "audit.view")) return "all";
  return listApps().filter((a) => can(actor, `${a.id}.audit.view`)).map((a) => a.id);
}
