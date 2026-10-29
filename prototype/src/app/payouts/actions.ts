"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requestBankChange } from "@/apps/payouts/actions";
import { BANK_CHANGE_APPROVAL } from "@/apps/payouts/policy";
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
    console.error(err instanceof Error ? err.message : "payouts action failed");
    return { ok: false, message: "Something went wrong. Try again." };
  }
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function requestBankChangeAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const accountNumber = field(form, "accountNumber");
  if (accountNumber !== field(form, "confirmAccountNumber")) {
    return { ok: false, message: "Account numbers don't match." };
  }
  return handle(async () => {
    await runAction(requestBankChange, user, {
      payeeId: field(form, "payeeId"),
      bankName: field(form, "bankName"),
      routingNumber: field(form, "routingNumber"),
      accountNumber,
      reason: field(form, "reason"),
    });
    return "Sent for approval by another finance admin. The payee keeps its current account until then.";
  });
}

export async function decideBankChangeAction(requestId: string, _prev: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  const decision = form.get("decision");
  const comment = field(form, "comment");
  if (decision !== "APPROVE" && decision !== "REJECT") return { ok: false, message: "Pick approve or reject." };
  if (!comment) return { ok: false, message: "A reason is required for the decision." };
  const request = await db.approvalRequest.findUnique({ where: { id: requestId }, select: { app: true, action: true } });
  if (request?.app !== "payouts" || request.action !== BANK_CHANGE_APPROVAL) {
    return { ok: false, message: "Not a bank account change request." };
  }
  return handle(async () => {
    const result = await runAction(decideApproval, user, { requestId, decision, comment });
    if (result.status === "APPROVED") return "Approved. Payouts now go to the new account.";
    if (result.status === "REJECTED") return "Rejected. The payee keeps its current account.";
    return "Approval recorded; more approvals needed.";
  });
}
