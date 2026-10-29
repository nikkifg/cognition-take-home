// App registry. New apps register here: navigation, permissions (and which
// roles get them), sensitive fields and approval handlers. See AGENTS.md.
import { applyProdChange } from "@/apps/flags/approval-handlers";
import { applySecondApproval, returnAfterSecondReviewRejected } from "@/app/kyc/_lib/second-review";
import { PROD_CHANGE } from "@/apps/flags/policy";
import type { AppDefinition } from "@/platform/types";

const apps: AppDefinition[] = [
  {
    id: "kyc",
    name: "KYC review queue",
    description: "Claim and decide KYC cases; four-eyes on high-risk applicants.",
    href: "/kyc",
    status: "live",
    viewPermission: "kyc.view",
    permissions: {
      "kyc.view": {
        description: "View KYC cases",
        roles: ["compliance_analyst", "compliance_senior_reviewer", "admin"],
      },
      "kyc.case.claim": {
        description: "Claim a case",
        roles: ["compliance_analyst", "compliance_senior_reviewer"],
      },
      "kyc.audit.view": {
        description: "View KYC audit events",
        roles: ["compliance_senior_reviewer"],
      },
      "kyc.escalation.claim": {
        description: "Claim an escalated case",
        roles: ["compliance_senior_reviewer"],
      },
      "kyc.case.decide": {
        description: "Approve, reject or escalate a case",
        roles: ["compliance_analyst", "compliance_senior_reviewer"],
      },
      "kyc.case.approve_high_risk": {
        description: "Second review on high-risk cases",
        roles: ["compliance_senior_reviewer"],
      },
      "kyc.ssn.reveal": {
        description: "Reveal an applicant's full SSN",
        roles: ["compliance_senior_reviewer"],
      },
    },
    sensitiveFields: {
      "applicant.ssn": {
        label: "SSN",
        permission: "kyc.ssn.reveal",
        read: async (client, id) =>
          (await client.kycApplicant.findUnique({ where: { id }, select: { ssn: true } }))?.ssn ??
          null,
        mask: (v) => `•••-••-${v.slice(-4)}`,
      },
    },
    approvalHandlers: { "kyc.case.approve_high_risk": applySecondApproval },
    rejectionHandlers: { "kyc.case.approve_high_risk": returnAfterSecondReviewRejected },
  },
  {
    id: "refunds",
    name: "Refunds dashboard",
    description: "Request and approve refunds with per-role limits.",
    href: "/refunds",
    status: "planned",
    viewPermission: "refunds.view",
    permissions: {
      "refunds.view": {
        description: "View transactions and refunds",
        roles: ["support_agent", "finance_approver", "admin"],
      },
      "refunds.request": {
        description: "Request a refund",
        roles: ["support_agent", "finance_approver"],
      },
      "refunds.approve": {
        description: "Approve refunds over the requester's limit",
        roles: ["finance_approver"],
      },
    },
  },
  {
    id: "flags",
    name: "Feature flags",
    description: "Per-environment flag toggles; prod changes need approval.",
    href: "/flags",
    status: "live",
    viewPermission: "flags.view",
    permissions: {
      "flags.view": { description: "View flags", roles: ["engineer", "admin"] },
      "flags.update_nonprod": {
        description: "Change dev/staging values directly",
        roles: ["engineer"],
      },
      "flags.request_prod": {
        description: "Request a prod change",
        roles: ["engineer"],
      },
      "flags.approve_prod": {
        description: "Approve a prod change",
        roles: ["engineer"],
      },
    },
    approvalHandlers: { [PROD_CHANGE]: applyProdChange },
  },
];

export default apps;
