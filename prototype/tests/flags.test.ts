import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "@/lib/db";
import { requestProdChange, setNonprodValue } from "@/apps/flags/actions";
import { FlagStateError } from "@/apps/flags/errors";
import { PROD_CHANGE } from "@/apps/flags/policy";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { ForbiddenError, SelfApprovalError } from "@/platform/errors";
import type { Actor } from "@/platform/roles";
import { auditFor, makeFlag, makeUser } from "./fixtures";

let engineer: Actor, engineer2: Actor, admin: Actor, support: Actor;

before(async () => {
  [engineer, engineer2, admin, support] = await Promise.all([
    makeUser("engineer"),
    makeUser("engineer"),
    makeUser("admin"),
    makeUser("support_agent"),
  ]);
});

after(() => db.$disconnect());

async function flagWith(env: "dev" | "staging" | "prod") {
  const flag = await makeFlag("flags");
  return { flag, value: flag.values.find((v) => v.environment === env)! };
}
const getValue = (id: string) => db.flagValue.findUniqueOrThrow({ where: { id } });
const changesFor = (flagId: string) => db.flagChange.findMany({ where: { flagId } });

describe("Flags: dev/staging changes apply directly", () => {
  for (const env of ["dev", "staging"] as const) {
    it(`toggling ${env} updates the value, records a FlagChange and audits before/after`, async () => {
      const { flag, value } = await flagWith(env);

      await runAction(setNonprodValue, engineer, { flagId: flag.id, environment: env, enabled: true, reason: "try it" });

      const stored = await getValue(value.id);
      assert.equal(stored.enabled, true);
      assert.equal(stored.updatedById, engineer.id);
      const [change] = await changesFor(flag.id);
      assert.equal(change.environment, env);
      assert.equal(change.toEnabled, true);
      assert.equal(change.changedById, engineer.id);
      assert.equal(change.approvalRequestId, null);
      assert.equal(await db.approvalRequest.count({ where: { entityId: value.id } }), 0);

      const [event] = await auditFor(value.id);
      assert.equal(event.action, "flags.value.set");
      assert.equal(event.app, "flags");
      assert.equal(event.actorId, engineer.id);
      assert.deepEqual(JSON.parse(event.before!), { key: flag.key, environment: env, enabled: false, updatedById: null });
      assert.deepEqual(JSON.parse(event.after!), { key: flag.key, environment: env, enabled: true, updatedById: engineer.id });
    });
  }

  it("refuses to set prod directly", async () => {
    const { flag, value } = await flagWith("prod");
    await assert.rejects(
      runAction(setNonprodValue, engineer, { flagId: flag.id, environment: "prod", enabled: true }),
      FlagStateError,
    );
    assert.equal((await getValue(value.id)).enabled, false);
    assert.equal((await changesFor(flag.id)).length, 0);
  });

  it("rejects a no-op change", async () => {
    const { flag } = await flagWith("dev");
    await assert.rejects(
      runAction(setNonprodValue, engineer, { flagId: flag.id, environment: "dev", enabled: false }),
      /already off in dev/,
    );
  });
});

describe("Flags: RBAC", () => {
  for (const role of ["admin", "support"] as const) {
    it(`${role} can't change dev or request prod (403), nothing changes and the denial is audited`, async () => {
      const actor = role === "admin" ? admin : support;
      const { flag } = await flagWith("dev");

      await assert.rejects(
        runAction(setNonprodValue, actor, { flagId: flag.id, environment: "dev", enabled: true }),
        (e) => e instanceof ForbiddenError && e.status === 403,
      );
      await assert.rejects(
        runAction(requestProdChange, actor, { flagId: flag.id, enabled: true, reason: "x" }),
        ForbiddenError,
      );

      const stored = await db.flagValue.findMany({ where: { flagId: flag.id } });
      assert.ok(stored.every((v) => !v.enabled));
      assert.equal(await db.approvalRequest.count({ where: { entityId: { in: stored.map((v) => v.id) } } }), 0);
      const denied = await db.auditEvent.findMany({ where: { actorId: actor.id, action: "action.denied", app: "flags" } });
      assert.ok(denied.some((e) => /flags\.value\.set: Missing permission: flags\.update_nonprod/.test(e.reason ?? "")));
      assert.ok(denied.some((e) => /flags\.prod\.request: Missing permission: flags\.request_prod/.test(e.reason ?? "")));
    });
  }
});

describe("Flags: prod changes need approval", () => {
  async function requested() {
    const { flag, value } = await flagWith("prod");
    const request = await runAction(requestProdChange, engineer, { flagId: flag.id, enabled: true, reason: "launch" });
    return { flag, value, request };
  }

  it("a prod request creates an approval and does not change the value", async () => {
    const { flag, value, request } = await requested();

    assert.equal(request.status, "PENDING");
    assert.equal(request.action, PROD_CHANGE);
    assert.equal(request.approverPermission, "flags.approve_prod");
    assert.equal(request.entityId, value.id);
    assert.equal((await getValue(value.id)).enabled, false);
    assert.equal((await changesFor(flag.id)).length, 0);
    const audited = await db.auditEvent.findFirst({ where: { entityId: request.id, action: "approval.requested" } });
    assert.equal(audited?.actorId, engineer.id);
    assert.match(audited?.reason ?? "", /in prod: launch/);
  });

  it("requires a reason", async () => {
    const { flag } = await flagWith("prod");
    await assert.rejects(
      runAction(requestProdChange, engineer, { flagId: flag.id, enabled: true, reason: "  " }),
      /reason is required/,
    );
  });

  it("allows only one pending request per flag", async () => {
    const { flag } = await requested();
    await assert.rejects(
      runAction(requestProdChange, engineer2, { flagId: flag.id, enabled: true, reason: "again" }),
      /already waiting for approval/,
    );
  });

  it("the requester can't approve their own prod change", async () => {
    const { value, request } = await requested();
    await assert.rejects(
      runAction(decideApproval, engineer, { requestId: request.id, decision: "APPROVE" }),
      SelfApprovalError,
    );
    assert.equal((await getValue(value.id)).enabled, false);
    assert.equal((await db.approvalRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "PENDING");
  });

  it("admin can view but not approve", async () => {
    const { value, request } = await requested();
    await assert.rejects(runAction(decideApproval, admin, { requestId: request.id, decision: "APPROVE" }), ForbiddenError);
    assert.equal((await getValue(value.id)).enabled, false);
  });

  it("a different engineer's approval applies it, links the FlagChange and audits it", async () => {
    const { flag, value, request } = await requested();

    const result = await runAction(decideApproval, engineer2, { requestId: request.id, decision: "APPROVE" });

    assert.equal(result.status, "APPROVED");
    const stored = await getValue(value.id);
    assert.equal(stored.enabled, true);
    assert.equal(stored.updatedById, engineer.id);
    const [change] = await changesFor(flag.id);
    assert.equal(change.environment, "prod");
    assert.equal(change.toEnabled, true);
    assert.equal(change.changedById, engineer.id);
    assert.equal(change.approvalRequestId, request.id);
    assert.equal(change.reason, "launch");

    const applied = (await auditFor(value.id)).find((e) => e.action === "flags.prod.applied");
    assert.ok(applied);
    assert.equal(applied.actorId, engineer2.id);
    assert.equal(JSON.parse(applied.before!).enabled, false);
    assert.equal(JSON.parse(applied.after!).enabled, true);

    // Once applied, a new request is allowed again (turning it back off).
    const next = await runAction(requestProdChange, engineer2, { flagId: flag.id, enabled: false, reason: "rollback" });
    assert.equal(next.status, "PENDING");
  });

  it("a rejection leaves prod unchanged and frees the flag for a new request", async () => {
    const { flag, value, request } = await requested();

    const result = await runAction(decideApproval, engineer2, { requestId: request.id, decision: "REJECT", comment: "not yet" });

    assert.equal(result.status, "REJECTED");
    assert.equal((await getValue(value.id)).enabled, false);
    assert.equal((await changesFor(flag.id)).length, 0);
    const again = await runAction(requestProdChange, engineer, { flagId: flag.id, enabled: true, reason: "retry" });
    assert.equal(again.status, "PENDING");
  });
});
