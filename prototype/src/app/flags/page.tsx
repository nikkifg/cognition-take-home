import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENVIRONMENTS, NONPROD, PROD_CHANGE, type ProdChangePayload } from "@/apps/flags/policy";
import { db } from "@/lib/db";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { decideProdAction, requestProdAction, setNonprodAction } from "./actions";
import { ProdRequestDialog, ReviewDialog, ToggleButton } from "./flag-forms";

const RECENT_CHANGES = 20;
const time = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

function OnOff({ enabled }: { enabled: boolean }) {
  return <Badge variant={enabled ? "default" : "outline"}>{enabled ? "On" : "Off"}</Badge>;
}

async function Flags() {
  const user = await requireUser();
  if (!can(user, "flags.view")) {
    return <p className="text-sm text-destructive">403: you need the flags.view permission to see feature flags.</p>;
  }
  const canSetNonprod = can(user, "flags.update_nonprod");
  const canRequestProd = can(user, "flags.request_prod");
  const canApproveProd = can(user, "flags.approve_prod") && can(user, "approvals.decide");

  const [flags, pending, changes] = await Promise.all([
    db.featureFlag.findMany({ include: { values: true }, orderBy: { key: "asc" } }),
    db.approvalRequest.findMany({
      where: { app: "flags", action: PROD_CHANGE, status: "PENDING" },
      include: { requestedBy: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.flagChange.findMany({
      include: {
        flag: { select: { key: true } },
        changedBy: { select: { displayName: true } },
        approvalRequest: { include: { decisions: { where: { decision: "APPROVE" }, include: { approver: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_CHANGES,
    }),
  ]);
  const pendingByValue = new Map(pending.map((r) => [r.entityId, r]));

  return (
    <>
      <h2 className="text-lg font-semibold">Pending prod changes</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested (UTC)</TableHead>
              <TableHead>Flag</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No prod changes waiting for approval.
                </TableCell>
              </TableRow>
            )}
            {pending.map((r) => {
              const p = JSON.parse(r.payload) as ProdChangePayload;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{time(r.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.key}</TableCell>
                  <TableCell>
                    <OnOff enabled={p.fromEnabled} /> → <OnOff enabled={p.toEnabled} />
                  </TableCell>
                  <TableCell className="whitespace-normal">{p.reason}</TableCell>
                  <TableCell>{r.requestedBy.displayName}</TableCell>
                  <TableCell className="text-right">
                    {canApproveProd ? (
                      <ReviewDialog
                        action={decideProdAction.bind(null, r.id)}
                        summary={r.summary}
                        ownRequest={r.requestedById === user.id}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">Waiting for an engineer</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-semibold">Flags</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Description</TableHead>
              {ENVIRONMENTS.map((env) => (
                <TableHead key={env}>{env}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags.map((flag) => (
              <TableRow key={flag.id}>
                <TableCell className="font-mono text-xs">{flag.key}</TableCell>
                <TableCell className="whitespace-normal">{flag.description}</TableCell>
                {ENVIRONMENTS.map((env) => {
                  const value = flag.values.find((v) => v.environment === env);
                  if (!value) return <TableCell key={env}>—</TableCell>;
                  const request = pendingByValue.get(value.id);
                  const next = !value.enabled;
                  return (
                    <TableCell key={env}>
                      <div className="flex items-center gap-2">
                        <OnOff enabled={value.enabled} />
                        {NONPROD.includes(env) && canSetNonprod && (
                          <ToggleButton
                            action={setNonprodAction.bind(null, flag.id, env, next)}
                            label={next ? "Turn on" : "Turn off"}
                          />
                        )}
                        {env === "prod" &&
                          (request ? (
                            <Badge variant="secondary">Pending approval</Badge>
                          ) : (
                            canRequestProd && (
                              <ProdRequestDialog
                                action={requestProdAction.bind(null, flag.id, next)}
                                flagKey={flag.key}
                                enabled={next}
                              />
                            )
                          ))}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-semibold">Recent changes</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Flag</TableHead>
              <TableHead>Environment</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Changed by</TableHead>
              <TableHead>Approved by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{time(c.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">{c.flag.key}</TableCell>
                <TableCell>{c.environment}</TableCell>
                <TableCell>
                  <OnOff enabled={c.fromEnabled} /> → <OnOff enabled={c.toEnabled} />
                </TableCell>
                <TableCell className="whitespace-normal">{c.reason ?? "—"}</TableCell>
                <TableCell>{c.changedBy.displayName}</TableCell>
                <TableCell>
                  {c.approvalRequest?.decisions.map((d) => d.approver.displayName).join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function FlagsPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          Toggle dev and staging directly. Prod changes need approval from a different engineer.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Flags />
      </Suspense>
    </>
  );
}
