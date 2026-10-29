import type { Actor } from "./roles";
import type { AuditInput, Tx } from "./types";

type AuditRecord = Required<Pick<AuditInput, "action" | "app">> & AuditInput & { actor: Actor };

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

/**
 * Insert-only writer for the audit log. There is deliberately no update or
 * delete helper, and database triggers reject both.
 */
export async function writeAudit(client: Tx, e: AuditRecord): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorId: e.actor.id,
      actorEmail: e.actor.email,
      actorRole: e.actor.role,
      action: e.action,
      app: e.app,
      entityType: e.entityType ?? null,
      entityId: e.entityId ?? null,
      before: json(e.before),
      after: json(e.after),
      reason: e.reason ?? null,
    },
  });
}
