import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "@/lib/db";
import { defineAction, runAction } from "@/platform/actions";
import { decideApproval, requestApproval } from "@/platform/approvals";
import { ForbiddenError, SelfApprovalError, ApprovalStateError } from "@/platform/errors";
import { can, permissionCatalog } from "@/platform/rbac";
import { listApps, registerAppForTesting } from "@/platform/registry";
import { ROLES, type Actor } from "@/platform/roles";
import { revealField } from "@/platform/sensitive";
import { auditFor, makeFlag, makeUser } from "./fixtures";

// Fixture actions standing in for future app actions.
const setDevFlag = defineAction({
  name: "flags.value.set",
  app: "flags",
  permission: "flags.update_nonprod",
  run: async (ctx, input: { valueId: string; enabled: boolean }) => {
    const before = await ctx.tx.flagValue.findUniqueOrThrow({ where: { id: input.valueId } });
    const updated = await ctx.tx.flagValue.update({
      where: { id: input.valueId },
      data: { enabled: input.enabled, updatedById: ctx.actor.id },
    });
    await ctx.audit({
      entityType: "FlagValue",
      entityId: updated.id,
      before: { enabled: before.enabled },
      after: { enabled: updated.enabled },
    });
    return updated;
  },
});

const forgetsToAudit = defineAction({
  name: "flags.value.silent",
  app: "flags",
  permission: "flags.update_nonprod",
  run: async (ctx, input: { valueId: string }) =>
    ctx.tx.flagValue.update({ where: { id: input.valueId }, data: { enabled: true } }),
});

registerAppForTesting({
  id: "fixture",
  name: "Fixture",
  description: "Test-only app",
  href: "/fixture",
  status: "planned",
  viewPermission: "fixture.view",
  permissions: {
    "fixture.view": { description: "view", roles: ["engineer"] },
    "fixture.approve": { description: "approve", roles: ["engineer", "finance_admin"] },
  },
  approvalHandlers: {
    "fixture.set_prod": async (ctx, payload) => {
      const { valueId } = payload as { valueId: string };
      await ctx.tx.flagValue.update({ where: { id: valueId }, data: { enabled: true } });
      await ctx.audit({ action: "fixture.prod_applied", entityType: "FlagValue", entityId: valueId, after: { enabled: true } });
    },
  },
});

const requestProdChange = defineAction({
  name: "fixture.request_prod",
  app: "fixture",
  permission: "fixture.view",
  run: (ctx, input: { valueId: string; requiredApprovals?: number }) =>
    requestApproval(ctx, {
      app: "fixture",
      action: "fixture.set_prod",
      payload: { valueId: input.valueId },
      summary: "Enable flag in prod",
      approverPermission: "fixture.approve",
      requiredApprovals: input.requiredApprovals,
      entityType: "FlagValue",
      entityId: input.valueId,
    }),
});

let engineer: Actor, engineer2: Actor, engineer3: Actor, finance: Actor;
let analyst: Actor, senior: Actor;

before(async () => {
  [engineer, engineer2, engineer3, finance, analyst, senior] = await Promise.all([
    makeUser("engineer"),
    makeUser("engineer"),
    makeUser("engineer"),
    makeUser("finance_admin"),
    makeUser("compliance_analyst"),
    makeUser("compliance_senior_reviewer"),
  ]);
});

after(() => db.$disconnect());

describe("RBAC", () => {
  it("rejects an action without the permission (403) and changes nothing", async () => {
    const flag = await makeFlag("rbac");
    const dev = flag.values.find((v) => v.environment === "dev")!;

    await assert.rejects(runAction(setDevFlag, analyst, { valueId: dev.id, enabled: true }), (e) => {
      assert.ok(e instanceof ForbiddenError);
      assert.equal(e.status, 403);
      return true;
    });

    const after = await db.flagValue.findUniqueOrThrow({ where: { id: dev.id } });
    assert.equal(after.enabled, false);
    const denied = await db.auditEvent.findFirst({
      where: { actorId: analyst.id, action: "action.denied" },
    });
    assert.match(denied?.reason ?? "", /flags\.value\.set: Missing permission: flags\.update_nonprod/);
  });

  it("denies unknown permissions by default", () => {
    assert.equal(can(engineer, "nope.unknown"), false);
    assert.equal(can(null, "flags.view"), false);
  });

  it("only grants permissions to real roles, prefixed with the app id", () => {
    for (const [name, p] of Object.entries(permissionCatalog())) {
      for (const role of p.roles) assert.ok(ROLES.includes(role), `${name}: ${role}`);
    }
    for (const app of listApps()) {
      assert.ok(permissionCatalog()[app.viewPermission], `${app.id} viewPermission missing`);
    }
  });
});

describe("Audit", () => {
  it("writes an audit event with actor, before and after on a change", async () => {
    const flag = await makeFlag("audit");
    const dev = flag.values.find((v) => v.environment === "dev")!;

    await runAction(setDevFlag, engineer, { valueId: dev.id, enabled: true });

    const [event] = await auditFor(dev.id);
    assert.equal(event.action, "flags.value.set");
    assert.equal(event.app, "flags");
    assert.equal(event.actorId, engineer.id);
    assert.deepEqual(JSON.parse(event.before!), { enabled: false });
    assert.deepEqual(JSON.parse(event.after!), { enabled: true });
  });

  it("rolls back an action that writes no audit event", async () => {
    const flag = await makeFlag("silent");
    const dev = flag.values.find((v) => v.environment === "dev")!;

    await assert.rejects(runAction(forgetsToAudit, engineer, { valueId: dev.id }), /without writing an audit event/);
    const after = await db.flagValue.findUniqueOrThrow({ where: { id: dev.id } });
    assert.equal(after.enabled, false);
  });

  it("is append-only: updates and deletes are rejected by the database", async () => {
    const event = await db.auditEvent.findFirstOrThrow();
    await assert.rejects(db.auditEvent.update({ where: { id: event.id }, data: { reason: "x" } }), /append-only/);
    await assert.rejects(db.auditEvent.delete({ where: { id: event.id } }), /append-only/);
    await assert.rejects(db.auditEvent.deleteMany(), /append-only/);
  });
});

describe("Approvals", () => {
  async function pendingRequest(requiredApprovals = 1) {
    const flag = await makeFlag("approval");
    const prod = flag.values.find((v) => v.environment === "prod")!;
    const request = await runAction(requestProdChange, engineer, { valueId: prod.id, requiredApprovals });
    return { prod, request };
  }

  it("rejects self-approval and leaves the change unapplied", async () => {
    const { prod, request } = await pendingRequest();

    await assert.rejects(
      runAction(decideApproval, engineer, { requestId: request.id, decision: "APPROVE" }),
      SelfApprovalError,
    );

    const stored = await db.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(stored.status, "PENDING");
    assert.equal((await db.flagValue.findUniqueOrThrow({ where: { id: prod.id } })).enabled, false);
    const denied = await db.auditEvent.findFirst({ where: { actorId: engineer.id, action: "action.denied", reason: { contains: "own request" } } });
    assert.ok(denied, "blocked self-approval is audited");
  });

  it("applies the change once a different approver approves", async () => {
    const { prod, request } = await pendingRequest();

    const result = await runAction(decideApproval, engineer2, { requestId: request.id, decision: "APPROVE" });

    assert.equal(result.status, "APPROVED");
    assert.equal((await db.flagValue.findUniqueOrThrow({ where: { id: prod.id } })).enabled, true);
    const actions = (await auditFor(prod.id)).map((e) => e.action);
    assert.ok(actions.includes("fixture.prod_applied"));
  });

  it("requires the request's approver permission", async () => {
    const { request } = await pendingRequest();
    await assert.rejects(
      runAction(decideApproval, senior, { requestId: request.id, decision: "APPROVE" }),
      ForbiddenError,
    );
  });

  it("four-eyes: needs two different approvers, neither the requester", async () => {
    const { prod, request } = await pendingRequest(2);

    const first = await runAction(decideApproval, engineer2, { requestId: request.id, decision: "APPROVE" });
    assert.equal(first.status, "PENDING");
    await assert.rejects(
      runAction(decideApproval, engineer2, { requestId: request.id, decision: "APPROVE" }),
      ApprovalStateError,
    );
    assert.equal((await db.flagValue.findUniqueOrThrow({ where: { id: prod.id } })).enabled, false);

    const second = await runAction(decideApproval, finance, { requestId: request.id, decision: "APPROVE" });
    assert.equal(second.status, "APPROVED");
    assert.equal((await db.flagValue.findUniqueOrThrow({ where: { id: prod.id } })).enabled, true);
  });

  it("a rejection closes the request without applying", async () => {
    const { prod, request } = await pendingRequest();
    const result = await runAction(decideApproval, engineer3, { requestId: request.id, decision: "REJECT", comment: "not now" });
    assert.equal(result.status, "REJECTED");
    assert.equal((await db.flagValue.findUniqueOrThrow({ where: { id: prod.id } })).enabled, false);
  });
});

describe("Masked reveal", () => {
  async function applicant() {
    return db.kycApplicant.create({
      data: { displayName: "Test Applicant T", country: "US", riskLevel: "HIGH", ssn: "000-00-9876" },
    });
  }

  it("returns the value to a permitted user and audits the reveal without the value", async () => {
    const a = await applicant();

    const value = await runAction(revealField, senior, { app: "kyc", field: "applicant.ssn", entityId: a.id });

    assert.equal(value, "000-00-9876");
    const [event] = await auditFor(a.id);
    assert.equal(event.action, "field.reveal");
    assert.equal(event.app, "kyc");
    assert.equal(event.actorId, senior.id);
    assert.equal(event.entityType, "applicant.ssn");
    assert.ok(!JSON.stringify(event).includes("9876"), "audit must not contain the revealed value");
  });

  it("denies a user without the reveal permission and audits the attempt", async () => {
    const a = await applicant();
    await assert.rejects(
      runAction(revealField, analyst, { app: "kyc", field: "applicant.ssn", entityId: a.id }),
      ForbiddenError,
    );
    const denied = await db.auditEvent.findFirst({
      where: { actorId: analyst.id, action: "action.denied", reason: { contains: "kyc.ssn.reveal" } },
    });
    assert.ok(denied);
  });
});
