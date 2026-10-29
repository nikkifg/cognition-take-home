import type { Role } from "@/generated/prisma/enums";

export type { Role };

/** Mirrors Entra ID app roles assigned to users in the enterprise app. */
export const ROLES: readonly Role[] = [
  "compliance_analyst",
  "compliance_senior_reviewer",
  "finance_admin",
  "engineer",
  "admin",
];

export const ROLE_LABELS: Record<Role, string> = {
  compliance_analyst: "Compliance analyst",
  compliance_senior_reviewer: "Senior compliance reviewer",
  finance_admin: "Finance admin",
  engineer: "Engineer",
  admin: "Admin",
};

/** The signed-in user as seen by platform code. */
export type Actor = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
};
