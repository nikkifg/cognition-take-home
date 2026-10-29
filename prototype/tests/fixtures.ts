import { db } from "@/lib/db";
import type { Actor, Role } from "@/platform/roles";

let n = 0;

/** Test-only user. Tests may write fixtures directly; app code may not. */
export async function makeUser(role: Role): Promise<Actor> {
  n++;
  const id = `test-${role}-${n}-${Date.now()}`;
  const user = await db.user.create({
    data: {
      id,
      oid: `${id}-oid`,
      tenantId: "test-tenant",
      email: `${id}@fintech.example`,
      displayName: `${role} ${n} (Test)`,
      role,
    },
  });
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

export async function makeFlag(key: string) {
  return db.featureFlag.create({
    data: {
      key: `${key}-${Date.now()}-${++n}`,
      description: "test flag",
      values: { create: [{ environment: "dev", enabled: false }, { environment: "prod", enabled: false }] },
    },
    include: { values: true },
  });
}

export const auditFor = (entityId: string) =>
  db.auditEvent.findMany({ where: { entityId }, orderBy: { id: "asc" } });
