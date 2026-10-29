import type { Role } from "./roles";

/** Fixed tenant id standing in for the company's Microsoft Entra ID tenant. */
export const MOCK_TENANT_ID = "00000000-0000-4000-8000-00000000c0de";

export type Persona = {
  id: string;
  oid: string;
  email: string;
  displayName: string;
  role: Role;
};

const persona = (n: number, id: string, displayName: string, role: Role): Persona => ({
  id,
  oid: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  email: `${id}@fintech.example`,
  displayName,
  role,
});

/** Synthetic sign-in personas. Seeded into the User table by prisma/seed.ts. */
export const PERSONAS: Persona[] = [
  persona(1, "compliance.analyst", "Compliance Analyst (Test)", "compliance_analyst"),
  persona(2, "compliance.senior", "Senior Compliance Reviewer (Test)", "compliance_senior_reviewer"),
  persona(4, "finance.admin1", "Finance Admin 1 (Test)", "finance_admin"),
  persona(5, "finance.admin2", "Finance Admin 2 (Test)", "finance_admin"),
  persona(6, "engineer1", "Engineer 1 (Test)", "engineer"),
  persona(7, "engineer2", "Engineer 2 (Test)", "engineer"),
  persona(8, "platform.admin", "Platform Admin (Test)", "admin"),
];
