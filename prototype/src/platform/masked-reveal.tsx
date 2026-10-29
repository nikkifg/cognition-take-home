"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function MaskedReveal({
  masked,
  canReveal,
  reveal,
}: {
  masked: string;
  canReveal: boolean;
  reveal: () => Promise<string>;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{value ?? masked}</span>
      {value ? (
        <Button size="xs" variant="ghost" onClick={() => setValue(null)}>
          Hide
        </Button>
      ) : canReveal ? (
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                setValue(await reveal());
                setError(null);
              } catch {
                setError("Reveal failed");
              }
            })
          }
        >
          Reveal
        </Button>
      ) : null}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
