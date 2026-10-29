// Seeds synthetic data only. No real names, SSNs or card data:
// - people are "(Test)" personas at fintech.example
// - SSNs use area number 000, which the SSA never issues
// - customers/transactions use TEST references
// Seeding writes directly with Prisma; app code must use actions instead.
import "dotenv/config";
import { db } from "../src/lib/db";
import { MOCK_TENANT_ID, PERSONAS } from "../src/platform/personas";
import type { Environment, IdCheckResult, KycCaseStatus, RefundStatus, RiskLevel } from "../src/generated/prisma/enums";

const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const daysAgo = (d: number) => new Date(Date.UTC(2026, 9, 1) - d * 86_400_000);
const byId = (id: string) => PERSONAS.find((p) => p.id === id)!.id;

async function reset() {
  // AuditEvent is append-only (DB triggers) and is never cleared here.
  await db.flagChange.deleteMany();
  await db.flagValue.deleteMany();
  await db.featureFlag.deleteMany();
  await db.refundRequest.deleteMany();
  await db.transaction.deleteMany();
  await db.idCheck.deleteMany();
  await db.kycCase.deleteMany();
  await db.kycApplicant.deleteMany();
  await db.approvalDecision.deleteMany();
  await db.approvalRequest.deleteMany();
}

async function seedUsers() {
  for (const p of PERSONAS) {
    const data = { oid: p.oid, tenantId: MOCK_TENANT_ID, email: p.email, displayName: p.displayName, role: p.role };
    await db.user.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }
}

async function seedKyc() {
  const risks: RiskLevel[] = ["LOW", "MEDIUM", "HIGH"];
  const countries = ["US", "GB", "CA", "DE"];
  const checkResults: IdCheckResult[] = ["PASS", "PASS", "NEEDS_REVIEW", "FAIL"];
  const analyst = byId("compliance.analyst");
  const senior = byId("compliance.senior");

  const cases: { status: KycCaseStatus; claimedBy?: string; decidedBy?: string; reason?: string }[] = [
    { status: "OPEN" },
    { status: "OPEN" },
    { status: "OPEN" },
    { status: "OPEN" },
    { status: "IN_REVIEW", claimedBy: analyst },
    { status: "IN_REVIEW", claimedBy: senior },
    { status: "ESCALATED", reason: "ID check needs manual review: document glare." },
    { status: "APPROVED", claimedBy: analyst, decidedBy: analyst, reason: "ID check passed; address verified." },
    { status: "APPROVED", claimedBy: senior, decidedBy: senior, reason: "Low risk; documents consistent." },
    { status: "REJECTED", claimedBy: analyst, decidedBy: analyst, reason: "Document failed authenticity check." },
    { status: "OPEN" },
    { status: "OPEN" },
  ];

  for (const [i, c] of cases.entries()) {
    const n = i + 1;
    const applicant = await db.kycApplicant.create({
      data: {
        displayName: `Test Applicant ${pad(n, 3)}`,
        country: countries[i % countries.length],
        riskLevel: risks[i % risks.length],
        ssn: `000-00-${pad(n)}`,
        createdAt: daysAgo(30 - n),
      },
    });
    await db.idCheck.create({
      data: {
        applicantId: applicant.id,
        provider: "MockID Verify",
        documentType: i % 2 ? "DRIVERS_LICENSE" : "PASSPORT",
        result: checkResults[i % checkResults.length],
        matchScore: [97, 91, 64, 22][i % 4],
        checkedAt: daysAgo(29 - n),
      },
    });
    await db.kycCase.create({
      data: {
        reference: `KYC-TEST-${pad(n)}`,
        applicantId: applicant.id,
        status: c.status,
        claimedById: c.claimedBy,
        claimedAt: c.claimedBy ? daysAgo(28 - n) : null,
        decisionReason: c.reason,
        decidedById: c.decidedBy,
        decidedAt: c.decidedBy ? daysAgo(27 - n) : null,
        createdAt: daysAgo(29 - n),
      },
    });
  }
}

async function seedRefunds() {
  const amounts = [1299, 4500, 8999, 15000, 2500, 74900, 3200, 120000, 999, 56000, 18950, 4200];
  const txns = [];
  for (const [i, amountCents] of amounts.entries()) {
    txns.push(
      await db.transaction.create({
        data: {
          reference: `TXN-TEST-${pad(i + 1)}`,
          customerRef: `CUST-TEST-${pad((i % 6) + 1)}`,
          amountCents,
          createdAt: daysAgo(20 - i),
        },
      }),
    );
  }
  const requests: { txn: number; amount: number; status: RefundStatus; by: string; reason: string }[] = [
    { txn: 0, amount: 1299, status: "PROCESSED", by: "support.agent", reason: "Duplicate charge" },
    { txn: 2, amount: 8999, status: "REQUESTED", by: "support.agent", reason: "Item not received" },
    { txn: 3, amount: 5000, status: "REQUESTED", by: "support.agent", reason: "Partial service outage credit" },
    { txn: 5, amount: 74900, status: "REJECTED", by: "support.agent", reason: "Customer request outside window" },
    { txn: 7, amount: 120000, status: "APPROVED", by: "finance.approver1", reason: "Chargeback pre-emption" },
    { txn: 9, amount: 56000, status: "FAILED", by: "finance.approver2", reason: "Billing error" },
  ];
  for (const [i, r] of requests.entries()) {
    await db.refundRequest.create({
      data: {
        transactionId: txns[r.txn].id,
        amountCents: r.amount,
        reason: r.reason,
        status: r.status,
        idempotencyKey: `idem-test-${pad(i + 1)}`,
        processorRef: r.status === "PROCESSED" ? `mockpay_re_test_${pad(i + 1)}` : null,
        requestedById: byId(r.by),
      },
    });
  }
}

async function seedFlags() {
  const flags: { key: string; description: string; on: Environment[] }[] = [
    { key: "new-checkout-flow", description: "Redesigned checkout", on: ["dev", "staging"] },
    { key: "kyc-auto-escalation", description: "Auto-escalate failed ID checks", on: ["dev", "staging", "prod"] },
    { key: "refunds-bulk-actions", description: "Bulk refund actions for support", on: ["dev"] },
    { key: "instant-payouts", description: "Instant payouts to debit cards", on: ["dev", "staging"] },
    { key: "maintenance-banner", description: "Show maintenance banner", on: [] },
    { key: "statement-export-v2", description: "New statement export pipeline", on: ["dev", "staging", "prod"] },
  ];
  const envs: Environment[] = ["dev", "staging", "prod"];
  for (const [i, f] of flags.entries()) {
    const flag = await db.featureFlag.create({ data: { key: f.key, description: f.description, createdAt: daysAgo(40 - i) } });
    for (const environment of envs) {
      const enabled = f.on.includes(environment);
      const changedBy = byId(i % 2 ? "engineer2" : "engineer1");
      const value = await db.flagValue.create({
        data: { flagId: flag.id, environment, enabled, updatedById: enabled ? changedBy : null },
      });
      if (enabled) {
        const createdAt = daysAgo(30 - i - envs.indexOf(environment));
        const reason = `Enable in ${environment}`;
        // Prod changes were approved by the other engineer (four-eyes).
        const approval =
          environment === "prod"
            ? await seedApproval(value.id, changedBy, otherEngineer(changedBy), {
                flagId: flag.id,
                key: f.key,
                fromEnabled: false,
                toEnabled: true,
                reason,
                createdAt,
              })
            : null;
        await db.flagChange.create({
          data: {
            flagId: flag.id,
            environment,
            fromEnabled: false,
            toEnabled: true,
            reason,
            changedById: changedBy,
            approvalRequestId: approval?.id,
            createdAt,
          },
        });
      }
    }
  }

  // One pending prod request so approvers have something to review.
  const pendingFlag = await db.featureFlag.findUniqueOrThrow({
    where: { key: "instant-payouts" },
    include: { values: { where: { environment: "prod" } } },
  });
  await seedApproval(pendingFlag.values[0].id, byId("engineer2"), null, {
    flagId: pendingFlag.id,
    key: pendingFlag.key,
    fromEnabled: false,
    toEnabled: true,
    reason: "Staging soak complete; ready for prod",
    createdAt: daysAgo(1),
  });
}

const otherEngineer = (id: string) => byId(id === "engineer1" ? "engineer2" : "engineer1");

/** A prod flag-change approval request; approved by `approver`, or pending if null. */
async function seedApproval(
  valueId: string,
  requestedById: string,
  approver: string | null,
  c: { flagId: string; key: string; fromEnabled: boolean; toEnabled: boolean; reason: string; createdAt: Date },
) {
  const payload = { valueId, flagId: c.flagId, key: c.key, fromEnabled: c.fromEnabled, toEnabled: c.toEnabled, reason: c.reason };
  return db.approvalRequest.create({
    data: {
      app: "flags",
      action: "flags.prod.apply",
      payload: JSON.stringify(payload),
      summary: `Turn ${c.key} ${c.toEnabled ? "on" : "off"} in prod: ${c.reason}`,
      entityType: "FlagValue",
      entityId: valueId,
      approverPermission: "flags.approve_prod",
      status: approver ? "APPROVED" : "PENDING",
      requestedById,
      createdAt: c.createdAt,
      resolvedAt: approver ? c.createdAt : null,
      decisions: approver ? { create: { approverId: approver, decision: "APPROVE", createdAt: c.createdAt } } : undefined,
    },
  });
}

async function main() {
  await reset();
  await seedUsers();
  await seedKyc();
  await seedRefunds();
  await seedFlags();
  console.log("Seeded synthetic data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
