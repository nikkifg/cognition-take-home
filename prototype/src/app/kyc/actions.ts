"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction } from "@/platform/actions";
import { decideApproval } from "@/platform/approvals";
import { PolicyError } from "@/platform/errors";
import { requireUser } from "@/platform/session";
import { claimCase, decideCase, DECISIONS, type Decision } from "@/apps/kyc/actions";

export type FormState = { error?: string } | undefined;

async function attempt(fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof PolicyError) return { error: err.message };
    throw err;
  }
  revalidatePath("/kyc", "layout");
  return undefined;
}

export async function claimCaseAction(caseId: string): Promise<FormState> {
  const user = await requireUser();
  const result = await attempt(() => runAction(claimCase, user, { caseId }));
  if (result?.error) return result;
  redirect(`/kyc/${caseId}`);
}

export async function decideCaseAction(caseId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = String(form.get("decision") ?? "") as Decision;
  if (!DECISIONS.includes(decision)) return { error: "Pick approve, reject or escalate" };
  return attempt(() =>
    runAction(decideCase, user, { caseId, decision, reason: String(form.get("reason") ?? "") }),
  );
}

export async function secondReviewAction(requestId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const decision = form.get("decision");
  const comment = String(form.get("comment") ?? "").trim();
  if (decision !== "APPROVE" && decision !== "REJECT") return { error: "Pick approve or reject" };
  if (!comment) return { error: "A reason is required" };
  return attempt(() => runAction(decideApproval, user, { requestId, decision, comment }));
}
