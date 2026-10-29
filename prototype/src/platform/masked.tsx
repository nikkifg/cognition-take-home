import { Suspense } from "react";
import { db } from "@/lib/db";
import { revealSensitiveValue } from "./masked-actions";
import { MaskedReveal } from "./masked-reveal";
import { can } from "./rbac";
import { getSensitiveField } from "./registry";
import { defaultMask } from "./sensitive";
import { getCurrentUser } from "./session";

type MaskedProps = {
  /** App id in apps.config.ts. */
  app: string;
  /** Key in that app's `sensitiveFields`. */
  field: string;
  entityId: string;
};

/**
 * Renders a sensitive field masked. The full value never reaches the client
 * unless the user has the field's permission and clicks Reveal (audited).
 */
export function Masked(props: MaskedProps) {
  return (
    <Suspense fallback={<span className="font-mono">••••</span>}>
      <MaskedValue {...props} />
    </Suspense>
  );
}

async function MaskedValue({ app, field, entityId }: MaskedProps) {
  const def = getSensitiveField(app, field);
  const [user, value] = await Promise.all([getCurrentUser(), def.read(db, entityId)]);
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <MaskedReveal
      masked={(def.mask ?? defaultMask)(value)}
      canReveal={can(user, def.permission)}
      reveal={revealSensitiveValue.bind(null, app, field, entityId)}
    />
  );
}
