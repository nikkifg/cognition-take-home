import { Suspense } from "react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Masked } from "@/platform/masked";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { ReviewDialog } from "../forms";
import { ChangeStatusBadge } from "../status-badge";

const RECENT = 10;
const time = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16);

function Account({ bankName, routingNumber, field, changeId }: {
  bankName: string;
  routingNumber: string;
  field: "change.oldAccountNumber" | "change.newAccountNumber";
  changeId: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span>{bankName}</span>
      <span className="font-mono text-xs text-muted-foreground">Routing {routingNumber}</span>
      <Masked app="payouts" field={field} entityId={changeId} />
    </div>
  );
}

async function Approvals() {
  const user = await requireUser();
  if (!can(user, "payouts.bank_change.approve")) {
    return <p className="text-sm text-destructive">403: you need the payouts.bank_change.approve permission.</p>;
  }
  const include = {
    requestedBy: { select: { id: true, displayName: true } },
    decisions: { include: { approver: { select: { displayName: true } } } },
  };
  const [pending, recent] = await Promise.all([
    db.approvalRequest.findMany({ where: { app: "payouts", status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
    db.approvalRequest.findMany({
      where: { app: "payouts", status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: RECENT,
      include,
    }),
  ]);
  const requests = [...pending, ...recent];
  const changes = await db.bankAccountChange.findMany({
    where: { id: { in: requests.map((r) => r.entityId).filter((id): id is string => !!id) } },
    select: {
      id: true,
      status: true,
      reason: true,
      oldBankName: true,
      oldRoutingNumber: true,
      newBankName: true,
      newRoutingNumber: true,
      payee: { select: { name: true, reference: true } },
    },
  });
  const changeById = new Map(changes.map((c) => [c.id, c]));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {pending.length} pending. You can’t approve a change you requested; another finance admin must. Verify new
        details out of band (e.g. a call to the number on file) before approving.
      </p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested (UTC)</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No bank account changes.
                </TableCell>
              </TableRow>
            )}
            {requests.map((a) => {
              const change = a.entityId ? changeById.get(a.entityId) : undefined;
              const mine = a.requestedBy.id === user.id;
              const decision = a.decisions[0];
              return (
                <TableRow key={a.id} className="align-top">
                  <TableCell className="font-mono text-xs">{time(a.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{change?.payee.name ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{change?.payee.reference}</div>
                  </TableCell>
                  <TableCell>
                    {change && (
                      <Account
                        bankName={change.oldBankName}
                        routingNumber={change.oldRoutingNumber}
                        field="change.oldAccountNumber"
                        changeId={change.id}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {change && (
                      <Account
                        bankName={change.newBankName}
                        routingNumber={change.newRoutingNumber}
                        field="change.newAccountNumber"
                        changeId={change.id}
                      />
                    )}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">{change?.reason}</TableCell>
                  <TableCell>
                    {a.requestedBy.displayName}
                    {mine && (
                      <Badge variant="outline" className="ml-2">
                        you
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      {change ? <ChangeStatusBadge status={change.status} /> : <Badge variant="outline">{a.status}</Badge>}
                      {decision && (
                        <span className="max-w-48 whitespace-normal text-xs text-muted-foreground">
                          {decision.approver.displayName}
                          {decision.comment ? `: ${decision.comment}` : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <ReviewDialog requestId={a.id} summary={a.summary} ownRequest={mine} open={a.status === "PENDING"} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Approvals />
    </Suspense>
  );
}
