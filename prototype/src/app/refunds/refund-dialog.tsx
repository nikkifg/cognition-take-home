"use client";

import { useActionState, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REASON_CODES } from "@/apps/refunds/policy";
import { requestRefundAction } from "./actions";

export function RefundDialog({
  transactionId,
  reference,
  amount,
  refundable,
}: {
  /** Kept mounted after the refund so the outcome stays visible; the trigger hides. */
  refundable: boolean;
  transactionId: string;
  reference: string;
  amount: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(requestRefundAction, null);
  const done = state?.ok;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {refundable && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            Refund
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Refund {amount} on {reference}
          </DialogTitle>
          <DialogDescription>
            Full refund only. A finance approver must approve it before it is sent to the processor.
          </DialogDescription>
        </DialogHeader>
        {state && (
          <Alert variant={state.ok ? "default" : "destructive"}>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {done ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="transactionId" value={transactionId} />
            <div className="flex flex-col gap-2">
              <Label htmlFor={`reason-${transactionId}`}>Reason code</Label>
              <Select name="reasonCode" required>
                <SelectTrigger id={`reason-${transactionId}`} className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_CODES).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
