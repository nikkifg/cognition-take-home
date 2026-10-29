"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "../actions";

type FormAction = (prev: FormState, form: FormData) => Promise<FormState>;

function ErrorText({ state }: { state: FormState }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

export function ClaimButton({ action, size = "sm" }: { action: FormAction; size?: "sm" | "default" }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button type="submit" size={size} disabled={pending}>
        Claim
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

export function DecisionForm({ action, highRisk }: { action: FormAction; highRisk: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Reason (required)</Label>
        <Textarea id="reason" name="reason" required placeholder="Why are you making this decision?" />
      </div>
      {highRisk && (
        <p className="text-sm text-muted-foreground">
          High-risk applicant: approving sends the case to a second, different senior reviewer.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="APPROVE" disabled={pending}>
          {highRisk ? "Approve (request second review)" : "Approve"}
        </Button>
        <Button type="submit" name="decision" value="REJECT" variant="destructive" disabled={pending}>
          Reject
        </Button>
        <Button type="submit" name="decision" value="ESCALATE" variant="outline" disabled={pending}>
          Escalate
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}

export function SecondReviewForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="comment">Reason (required)</Label>
        <Textarea id="comment" name="comment" required placeholder="Second reviewer's reason" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="APPROVE" disabled={pending}>
          Approve case
        </Button>
        <Button type="submit" name="decision" value="REJECT" variant="destructive" disabled={pending}>
          Send back to reviewer
        </Button>
      </div>
      <ErrorText state={state} />
    </form>
  );
}
