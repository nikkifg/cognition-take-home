"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "./actions";

type FormAction = (prev: FormState, form: FormData) => Promise<FormState>;

function ErrorText({ state }: { state: FormState }) {
  return state?.error ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : null;
}

/** Closes the dialog when the action succeeds. */
function useDialogAction(action: FormAction) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (!result?.error) setOpen(false);
    return result;
  }, undefined);
  return { open, setOpen, state, formAction, pending };
}

export function ToggleButton({ action, label }: { action: () => Promise<FormState>; label: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(() => action(), undefined);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <Button type="submit" size="xs" variant="outline" disabled={pending}>
        {label}
      </Button>
      <ErrorText state={state} />
    </form>
  );
}

export function ProdRequestDialog({ action, flagKey, enabled }: { action: FormAction; flagKey: string; enabled: boolean }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(action);
  const verb = enabled ? "on" : "off";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          Request {verb}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Turn <span className="font-mono">{flagKey}</span> {verb} in prod
          </DialogTitle>
          <DialogDescription>
            Prod changes need approval from a different engineer. Nothing changes until they approve.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`reason-${flagKey}`}>Reason (required)</Label>
            <Textarea id={`reason-${flagKey}`} name="reason" required placeholder="Why does prod need this change?" />
          </div>
          <ErrorText state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Request approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDialog({
  action,
  summary,
  ownRequest,
}: {
  action: FormAction;
  summary: string;
  ownRequest: boolean;
}) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(action);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review prod change</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {ownRequest && (
          <p className="text-sm text-destructive">You requested this change. The four-eyes rule blocks self-approval.</p>
        )}
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Comment (required to reject)</Label>
            <Textarea id="comment" name="comment" placeholder="Reviewer's comment" />
          </div>
          <ErrorText state={state} />
          <DialogFooter>
            <Button type="submit" name="decision" value="REJECT" variant="destructive" disabled={pending}>
              Reject
            </Button>
            <Button type="submit" name="decision" value="APPROVE" disabled={pending}>
              Approve and apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
