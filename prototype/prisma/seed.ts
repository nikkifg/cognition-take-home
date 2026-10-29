// Seeds synthetic data only. No real names, SSNs or card data:
// - people are "(Test)" personas at fintech.example
// - SSNs use area number 000, which the SSA never issues
// - customers/transactions use TEST references
// Seeding writes directly with Prisma; app code must use actions instead.
import "dotenv/config";
import { db } from "../src/lib/db";
import { MOCK_TENANT_ID, PERSONAS } from "../src/platform/personas";
import type {
  ApprovalStatus,
  Environment,
  IdCheckResult,
  KycCaseStatus,
  RefundReasonCode,
  RefundStatus,
  RiskLevel,
} from "../src/generated/prisma/enums";

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
  // Includes $50 and $400 unrefunded charges and $42.13, which the mock
  // processor declines.
  const amounts = [1299, 5000, 8999, 15000, 2500, 74900, 3200, 120000, 999, 40000, 18950, 4213, 9999, 10000];
  const txns = [];
  for (const [i, amountCents] of amounts.entries()) {
    const customer = pad((i % 6) + 1);
    txns.push(
      await db.transaction.create({
        data: {
          reference: `TXN-TEST-${pad(i + 1)}`,
          customerRef: `CUST-TEST-${customer}`,
          customerEmail: `test.customer${customer}@fintech.example`,
          amountCents,
          createdAt: daysAgo(20 - i),
        },
      }),
    );
  }
  type Seeded = {
    txn: number;
    status: RefundStatus;
    by: string;
    reasonCode: RefundReasonCode;
    approval?: { status: ApprovalStatus; by?: string };
  };
  const requests: Seeded[] = [
    { txn: 0, status: "SUCCEEDED", by: "finance.admin2", reasonCode: "DUPLICATE_CHARGE", approval: { status: "APPROVED", by: "finance.admin1" } },
    { txn: 3, status: "PENDING_APPROVAL", by: "finance.admin2", reasonCode: "CUSTOMER_REQUEST", approval: { status: "PENDING" } },
    { txn: 5, status: "REJECTED", by: "finance.admin2", reasonCode: "OTHER", approval: { status: "REJECTED", by: "finance.admin1" } },
    { txn: 7, status: "SUCCEEDED", by: "finance.admin1", reasonCode: "FRAUD", approval: { status: "APPROVED", by: "finance.admin2" } },
    { txn: 8, status: "FAILED", by: "finance.admin1", reasonCode: "CUSTOMER_REQUEST", approval: { status: "APPROVED", by: "finance.admin2" } },
    { txn: 10, status: "PENDING_APPROVAL", by: "finance.admin1", reasonCode: "DUPLICATE_CHARGE", approval: { status: "PENDING" } },
  ];
  const txnStatus: Partial<Record<RefundStatus, string>> = {
    SUCCEEDED: "REFUNDED",
    PENDING_APPROVAL: "REFUND_PENDING",
    PENDING: "REFUND_PENDING",
  };
  for (const [i, r] of requests.entries()) {
    const txn = txns[r.txn];
    const refund = await db.refundRequest.create({
      data: {
        transactionId: txn.id,
        amountCents: txn.amountCents,
        reasonCode: r.reasonCode,
        status: r.status,
        idempotencyKey: `idem-test-${pad(i + 1)}`,
        processorRef: r.status === "SUCCEEDED" || r.status === "FAILED" ? `mockpay_re_test_${pad(i + 1)}` : null,
        failureReason: r.status === "FAILED" ? "card_declined (seeded)" : null,
        requestedById: byId(r.by),
        createdAt: daysAgo(10 - i),
      },
    });
    if (txnStatus[r.status]) {
      await db.transaction.update({ where: { id: txn.id }, data: { status: txnStatus[r.status] } });
    }
    if (r.approval) {
      await db.approvalRequest.create({
        data: {
          app: "refunds",
          action: "refunds.execute",
          payload: JSON.stringify({ refundId: refund.id }),
          summary: `Refund $${(txn.amountCents / 100).toFixed(2)} on ${txn.reference} (seeded)`,
          entityType: "RefundRequest",
          entityId: refund.id,
          approverPermission: "refunds.approve",
          status: r.approval.status,
          requestedById: byId(r.by),
          createdAt: daysAgo(10 - i),
          resolvedAt: r.approval.by ? daysAgo(9 - i) : null,
          decisions: r.approval.by
            ? {
                create: {
                  approverId: byId(r.approval.by),
                  decision: r.approval.status === "APPROVED" ? "APPROVE" : "REJECT",
                },
              }
            : undefined,
        },
      });
    }
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
      await db.flagValue.create({ data: { flagId: flag.id, environment, enabled, updatedById: enabled ? changedBy : null } });
      if (enabled) {
        await db.flagChange.create({
          data: {
            flagId: flag.id,
            environment,
            fromEnabled: false,
            toEnabled: true,
            reason: `Enable in ${environment}`,
            changedById: changedBy,
            createdAt: daysAgo(30 - i - envs.indexOf(environment)),
          },
        });
      }
    }
  }
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
