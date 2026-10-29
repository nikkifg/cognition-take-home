import { Suspense } from "react";
import { db } from "@/lib/db";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYEE_ACTIVE } from "@/apps/payouts/policy";
import { Masked } from "@/platform/masked";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { RequestChangeDialog } from "./forms";
import { ChangeStatusBadge } from "./status-badge";

async function Payees() {
  const user = await requireUser();
  if (!can(user, "payouts.view")) {
    return <p className="text-sm text-destructive">403: you need the payouts.view permission.</p>;
  }
  const canRequest = can(user, "payouts.bank_change.request");
  const payees = await db.payee.findMany({
    orderBy: { reference: "asc" },
    select: {
      id: true,
      reference: true,
      name: true,
      bankName: true,
      routingNumber: true,
      status: true,
      bankAccountChanges: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, createdAt: true, requestedBy: { select: { displayName: true } } },
      },
    },
  });

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payee</TableHead>
            <TableHead>Bank</TableHead>
            <TableHead>Routing</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Latest change</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {payees.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No payees.
              </TableCell>
            </TableRow>
          )}
          {payees.map((p) => {
            const change = p.bankAccountChanges[0];
            return (
              <TableRow key={p.id} className="align-top">
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{p.reference}</div>
                </TableCell>
                <TableCell>{p.bankName}</TableCell>
                <TableCell className="font-mono text-xs">{p.routingNumber}</TableCell>
                <TableCell>
                  <Masked app="payouts" field="payee.accountNumber" entityId={p.id} />
                </TableCell>
                <TableCell>
                  {change ? (
                    <div className="flex flex-col items-start gap-1">
                      <ChangeStatusBadge status={change.status} />
                      <span className="text-xs text-muted-foreground">
                        {change.createdAt.toISOString().slice(0, 10)} · {change.requestedBy.displayName}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canRequest && (
                    <RequestChangeDialog payeeId={p.id} payeeName={p.name} open={p.status === PAYEE_ACTIVE} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PayoutsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Payees />
    </Suspense>
  );
}
