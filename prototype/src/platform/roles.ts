import type { Role } from "@/generated/prisma/enums";

export type { Role };

/** Mirrors Entra ID app roles assigned to users in the enterprise app. */
export const ROLES: readonly Role[] = [
  "compliance_analyst",
  "compliance_senior_reviewer",
  "support_agent",
  "finance_approver",
  "engineer",
  "admin",
];

export const ROLE_LABELS: Record<Role, string> = {
  compliance_analyst: "Compliance analyst",
  compliance_senior_reviewer: "Senior compliance reviewer",
  support_agent: "Support agent",
  finance_approver: "Finance approver",
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
