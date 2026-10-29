"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { processRefund, requestRefund } from "@/apps/refunds/actions";
import { STATUS_LABELS, isReasonCode } from "@/apps/refunds/policy";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { PolicyError } from "@/platform/errors";
import { requireUser } from "@/platform/session";

export type FormResult = { ok: boolean; message: string } | null;

async function handle(fn: () => Promise<string>): Promise<FormResult> {
  try {
    const message = await fn();
    refresh();
    return { ok: true, message };
  } catch (err) {
    refresh();
    if (err instanceof PolicyError) return { ok: false, message: err.message };
    console.error(err);
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

function outcome(status: keyof typeof STATUS_LABELS, failureReason?: string | null) {
  if (status === "SUCCEEDED") return "Refund succeeded.";
  if (status === "FAILED") return `Refund failed: ${failureReason ?? "declined by processor"}.`;
  if (status === "PENDING_APPROVAL") return "Sent for approval by another finance admin.";
  return `Refund is ${STATUS_LABELS[status].toLowerCase()}.`;
}

export async function requestRefundAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const transactionId = String(form.get("transactionId") ?? "");
  const reasonCode = form.get("reasonCode");
  if (!isReasonCode(reasonCode)) return { ok: false, message: "Pick a reason code." };
  return handle(async () => {
    const requested = await runAction(requestRefund, user, { transactionId, reasonCode });
    return outcome(requested.status);
  });
}

export async function retryRefundAction(refundId: string): Promise<FormResult> {
  const user = await requireUser();
  return handle(async () => {
    const processed = await runAction(processRefund, user, { refundId });
    return outcome(processed.status, processed.failureReason);
  });
}

export async function decideRefundAction(
  requestId: string,
  decision: "APPROVE" | "REJECT",
): Promise<FormResult> {
  const user = await requireUser();
  return handle(async () => {
    const approval = await db.approvalRequest.findUnique({ where: { id: requestId } });
    if (!approval || approval.app !== "refunds" || !approval.entityId) {
      throw new PolicyError("Not a refund approval request");
    }
    const result = await runAction(decideApproval, user, { requestId, decision });
    if (result.status === "REJECTED") return "Rejected. The transaction can be refunded again.";
    if (result.status !== "APPROVED") return "Approval recorded; more approvals needed.";
    const processed = await runAction(processRefund, user, { refundId: approval.entityId });
    return `Approved. ${outcome(processed.status, processed.failureReason)}`;
  });
}
