import type { KycCase } from "@/generated/prisma/client";

/** Audit snapshot of a case. Never includes applicant PII. */
export const caseSnapshot = (c: KycCase) => ({
  status: c.status,
  claimedById: c.claimedById,
  decisionReason: c.decisionReason,
  decidedById: c.decidedById,
});
