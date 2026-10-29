"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { decideRefundAction, retryRefundAction, type FormResult } from "./actions";

function useResult() {
  const [result, setResult] = useState<FormResult>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FormResult>) => startTransition(async () => setResult(await fn()));
  return { result, pending, run };
}

function Message({ result }: { result: FormResult }) {
  if (!result) return null;
  return <p className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>{result.message}</p>;
}

export function RetryButton({ refundId, open }: { refundId: string; open: boolean }) {
  const { result, pending, run } = useResult();
  return (
    <div className="flex flex-col items-start gap-1">
      {open && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryRefundAction(refundId))}>
          Retry
        </Button>
      )}
      <Message result={result} />
    </div>
  );
}

/** Stays mounted after the decision (open=false) so the outcome stays visible. */
export function DecideButtons({ requestId, open }: { requestId: string; open: boolean }) {
  const { result, pending, run } = useResult();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className={open ? "flex gap-2" : "hidden"}>
        <Button size="sm" disabled={pending} onClick={() => run(() => decideRefundAction(requestId, "APPROVE"))}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => run(() => decideRefundAction(requestId, "REJECT"))}
        >
          Reject
        </Button>
      </div>
      <Message result={result} />
    </div>
  );
}
