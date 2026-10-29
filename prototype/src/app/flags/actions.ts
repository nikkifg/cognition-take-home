"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requestProdChange, setNonprodValue } from "@/apps/flags/actions";
import { isEnvironment, PROD_CHANGE } from "@/apps/flags/policy";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { PolicyError } from "@/platform/errors";
import { requireUser } from "@/platform/session";

export type FormState = { error?: string } | undefined;

async function attempt(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof PolicyError) return { error: err.message };
    throw err;
  }
  revalidatePath("/flags");
  return undefined;
}

export async function setNonprodAction(flagId: string, environment: string, enabled: boolean): Promise<FormState> {
  const user = await requireUser();
  if (!isEnvironment(environment) || typeof enabled !== "boolean") return { error: "Invalid change" };
  return attempt(() => runAction(setNonprodValue, user, { flagId, environment, enabled }));
}

export async function requestProdAction(flagId: string, enabled: boolean, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (typeof enabled !== "boolean") return { error: "Invalid change" };
  return attempt(() => runAction(requestProdChange, user, { flagId, enabled, reason: String(form.get("reason") ?? "") }));
}

export async function decideProdAction(requestId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = form.get("decision");
  const comment = String(form.get("comment") ?? "").trim();
  if (decision !== "APPROVE" && decision !== "REJECT") return { error: "Pick approve or reject" };
  if (decision === "REJECT" && !comment) return { error: "A reason is required to reject" };
  const request = await db.approvalRequest.findUnique({ where: { id: requestId }, select: { app: true, action: true } });
  if (request?.app !== "flags" || request.action !== PROD_CHANGE) return { error: "Not a flag change request" };
  return attempt(() => runAction(decideApproval, user, { requestId, decision, comment: comment || undefined }));
}
