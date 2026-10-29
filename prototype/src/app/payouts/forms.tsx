"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { decideBankChangeAction, requestBankChangeAction, type FormResult } from "./actions";

function Result({ state }: { state: FormResult }) {
  if (!state) return null;
  return (
    <Alert variant={state.ok ? "default" : "destructive"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

/**
 * Submits without React's automatic form reset, so a rejected request keeps what
 * the user typed. Includes the clicked submit button's name/value.
 */
function submitKeepingInput(action: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(e.currentTarget, submitter);
    startTransition(() => action(form));
  };
}

function TextField({ id, name, label, ...props }: { id: string; name: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} required autoComplete="off" {...props} />
    </div>
  );
}

export function RequestChangeDialog({
  payeeId,
  payeeName,
  open: available,
}: {
  payeeId: string;
  payeeName: string;
  /** Kept mounted after the request so the outcome stays visible; the trigger hides. */
  open: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(requestBankChangeAction, null);
  const id = (f: string) => `${f}-${payeeId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {available && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Change account
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change payout account for {payeeName}</DialogTitle>
          <DialogDescription>
            Another finance admin must approve the change. Payouts keep going to the current account until then.
          </DialogDescription>
        </DialogHeader>
        <Result state={state} />
        {state?.ok ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        ) : (
          <form onSubmit={submitKeepingInput(formAction)} className="flex flex-col gap-4">
            <input type="hidden" name="payeeId" value={payeeId} />
            <TextField id={id("bank")} name="bankName" label="Bank name" maxLength={100} />
            <TextField
              id={id("routing")}
              name="routingNumber"
              label="Routing number (9 digits)"
              inputMode="numeric"
              pattern="\d{9}"
            />
            <TextField
              id={id("account")}
              name="accountNumber"
              label="Account number"
              type="password"
              inputMode="numeric"
              pattern="\d{4,17}"
            />
            <TextField
              id={id("confirm")}
              name="confirmAccountNumber"
              label="Confirm account number"
              type="password"
              inputMode="numeric"
              pattern="\d{4,17}"
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor={id("reason")}>Reason (required)</Label>
              <Textarea
                id={id("reason")}
                name="reason"
                required
                placeholder="e.g. Vendor letter on file; confirmed by phone with known contact"
              />
            </div>
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
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDialog({
  requestId,
  summary,
  ownRequest,
  open: available,
}: {
  requestId: string;
  summary: string;
  ownRequest: boolean;
  /** Kept mounted after the decision so the outcome stays visible; the trigger hides. */
  open: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(decideBankChangeAction.bind(null, requestId), null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {available && (
        <DialogTrigger asChild>
          <Button size="sm">Review</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review bank account change</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {ownRequest && (
          <p className="text-sm text-destructive">You requested this change. The four-eyes rule blocks self-approval.</p>
        )}
        <Result state={state} />
        {state?.ok ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        ) : (
          <form onSubmit={submitKeepingInput(formAction)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`comment-${requestId}`}>Reason (required)</Label>
              <Textarea
                id={`comment-${requestId}`}
                name="comment"
                required
                placeholder="e.g. Verified new details by calling the vendor's number on file"
              />
            </div>
            <DialogFooter>
              <Button type="submit" name="decision" value="REJECT" variant="destructive" disabled={pending}>
                Reject
              </Button>
              <Button type="submit" name="decision" value="APPROVE" disabled={pending}>
                Approve and apply
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
