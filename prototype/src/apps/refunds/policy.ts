// Refund rules shared by server code and the UI. No server-only imports here.
import type { RefundReasonCode, RefundStatus } from "@/generated/prisma/enums";

/** Refunds at or above this amount need a finance approver's sign-off. */
export const APPROVAL_THRESHOLD_CENTS = 100_00;

export const needsApproval = (amountCents: number) => amountCents >= APPROVAL_THRESHOLD_CENTS;

export const REASON_CODES: Record<RefundReasonCode, string> = {
  DUPLICATE_CHARGE: "Duplicate charge",
  CUSTOMER_REQUEST: "Customer request",
  FRAUD: "Fraud",
  OTHER: "Other",
};

export const isReasonCode = (v: unknown): v is RefundReasonCode =>
  typeof v === "string" && Object.hasOwn(REASON_CODES, v);

export const STATUS_LABELS: Record<RefundStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  PENDING: "Pending",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
};

/** Transaction.status values. A transaction is refundable only while SETTLED. */
export const TXN_SETTLED = "SETTLED";
export const TXN_REFUND_PENDING = "REFUND_PENDING";
export const TXN_REFUNDED = "REFUNDED";

export const formatCents = (cents: number, currency = "USD") =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency });

/** Approval handler key in apps.config.ts. */
export const EXECUTE_APPROVAL_ACTION = "refunds.execute";
