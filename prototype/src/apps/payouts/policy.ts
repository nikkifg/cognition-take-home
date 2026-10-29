// Payout rules shared by server code and the UI. No server-only imports here.
import type { BankAccountChangeStatus } from "@/generated/prisma/enums";

/** Payee.status values. A payee accepts a new change request only while ACTIVE. */
export const PAYEE_ACTIVE = "ACTIVE";
export const PAYEE_CHANGE_PENDING = "CHANGE_PENDING";

/** Approval handler key in apps.config.ts. */
export const BANK_CHANGE_APPROVAL = "payouts.bank_change.apply";

export const STATUS_LABELS: Record<BankAccountChangeStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export type BankDetails = { bankName: string; routingNumber: string; accountNumber: string };

/** Returns an error message, or null if the details are well-formed. Never echoes the account number. */
export function validateBankDetails(d: BankDetails): string | null {
  if (!d.bankName || d.bankName.length > 100) return "Bank name is required (max 100 characters).";
  if (!/^\d{9}$/.test(d.routingNumber)) return "Routing number must be 9 digits.";
  if (!/^\d{4,17}$/.test(d.accountNumber)) return "Account number must be 4 to 17 digits.";
  return null;
}

/** Audit/summary snapshot of bank details. Leaves out the account number. */
export const bankSnapshot = (d: { bankName: string; routingNumber: string }) => ({
  bankName: d.bankName,
  routingNumber: d.routingNumber,
});
