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
