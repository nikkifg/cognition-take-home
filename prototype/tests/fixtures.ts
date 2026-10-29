import { db } from "@/lib/db";
import type { Actor, Role } from "@/platform/roles";
import type { KycCaseStatus, RiskLevel } from "@/generated/prisma/enums";

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
      values: {
        create: [
          { environment: "dev", enabled: false },
          { environment: "staging", enabled: false },
          { environment: "prod", enabled: false },
        ],
      },
    },
    include: { values: true },
  });
}

export const auditFor = (entityId: string) =>
  db.auditEvent.findMany({ where: { entityId }, orderBy: { id: "asc" } });

export async function makeTransaction(amountCents: number) {
  const ref = `TXN-TEST-T${Date.now()}-${++n}`;
  return db.transaction.create({
    data: {
      reference: ref,
      customerRef: `CUST-TEST-T${n}`,
      customerEmail: `test.customer.t${n}@fintech.example`,
      amountCents,
      createdAt: new Date(),
    },
  });
}

let caseN = 0;

/** Test-only KYC case for a synthetic applicant. */
export async function makeKycCase(riskLevel: RiskLevel, status: KycCaseStatus = "OPEN") {
  caseN++;
  const applicant = await db.kycApplicant.create({
    data: { displayName: `Applicant K${caseN} (Test)`, country: "US", riskLevel, ssn: `000-11-${String(caseN).padStart(4, "0")}` },
  });
  return db.kycCase.create({
    data: { reference: `KYC-TEST-T${caseN}-${Date.now()}`, applicantId: applicant.id, status },
  });
}

/** Test-only payee with a synthetic bank account. */
export async function makePayee() {
  const k = ++n;
  return db.payee.create({
    data: {
      reference: `PAYEE-TEST-T${Date.now()}-${k}`,
      name: `Payee T${k} (Test)`,
      bankName: "First Test Bank (Test)",
      routingNumber: "000000001",
      accountNumber: `0000${String(k).padStart(8, "0")}`,
    },
  });
}
