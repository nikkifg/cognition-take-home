// App registry. New apps register here: navigation, permissions (and which
// roles get them), sensitive fields and approval handlers. See AGENTS.md.
import { applySecondApproval, returnAfterSecondReviewRejected } from "@/app/kyc/_lib/second-review";
import type { AppDefinition } from "@/platform/types";
import { approveRefund, rejectRefund } from "@/apps/refunds/approval-handlers";
import { EXECUTE_APPROVAL_ACTION } from "@/apps/refunds/policy";

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
    description: "Search transactions and refund them; a second finance admin approves each refund.",
    href: "/refunds",
    status: "live",
    viewPermission: "refunds.view",
    permissions: {
      "refunds.view": {
        description: "View transactions and refunds",
        roles: ["finance_admin", "admin"],
      },
      "refunds.request": {
        description: "Request a full refund (another finance admin must approve it)",
        roles: ["finance_admin"],
      },
      "refunds.execute": {
        description: "Send an authorized refund to the payment processor (incl. retries)",
        roles: ["finance_admin"],
      },
      "refunds.approve": {
        description: "Approve or reject refund requests",
        roles: ["finance_admin"],
      },
      "refunds.customer_email.reveal": {
        description: "Reveal a customer's full email address",
        roles: ["finance_admin"],
      },
    },
    sensitiveFields: {
      "transaction.customerEmail": {
        label: "Customer email",
        permission: "refunds.customer_email.reveal",
        read: async (client, id) =>
          (await client.transaction.findUnique({ where: { id }, select: { customerEmail: true } }))
            ?.customerEmail ?? null,
        mask: (v) => `${v.slice(0, 1)}•••${v.slice(v.indexOf("@"))}`,
      },
    },
    approvalHandlers: { [EXECUTE_APPROVAL_ACTION]: approveRefund },
    rejectionHandlers: { [EXECUTE_APPROVAL_ACTION]: rejectRefund },
  },
  {
    id: "flags",
    name: "Feature flags",
    description: "Per-environment flag toggles; prod changes need approval.",
    href: "/flags",
    status: "planned",
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
  },
];

export default apps;
