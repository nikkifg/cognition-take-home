import { Suspense } from "react";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REASON_CODES, formatCents } from "@/apps/refunds/policy";
import { Masked } from "@/platform/masked";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { DecideButtons } from "../action-buttons";
import { RefundStatusBadge } from "../status-badge";

const RECENT = 10;

async function Approvals() {
  const user = await requireUser();
  if (!can(user, "refunds.approve")) {
    return <p className="text-sm text-destructive">403: you need the refunds.approve permission.</p>;
  }
  const include = { requestedBy: { select: { id: true, displayName: true } } };
  const [pending, recent] = await Promise.all([
    db.approvalRequest.findMany({ where: { app: "refunds", status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
    db.approvalRequest.findMany({
      where: { app: "refunds", status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: RECENT,
      include,
    }),
  ]);
  const requests = [...pending, ...recent];
  const refunds = await db.refundRequest.findMany({
    where: { id: { in: requests.map((r) => r.entityId).filter((id): id is string => !!id) } },
    include: { transaction: true },
  });
  const refundById = new Map(refunds.map((r) => [r.id, r]));

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {pending.length} pending. You can’t approve a request you made; another finance admin must.
      </p>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested (UTC)</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
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
                  No refund approvals.
                </TableCell>
              </TableRow>
            )}
            {requests.map((a) => {
              const refund = a.entityId ? refundById.get(a.entityId) : undefined;
              const mine = a.requestedBy.id === user.id;
              return (
                <TableRow key={a.id} className="align-top">
                  <TableCell className="font-mono text-xs">
                    {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{refund?.transaction.reference ?? "—"}</TableCell>
                  <TableCell>
                    {refund && <Masked app="refunds" field="transaction.customerEmail" entityId={refund.transactionId} />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {refund ? formatCents(refund.amountCents, refund.transaction.currency) : "—"}
                  </TableCell>
                  <TableCell>{refund ? REASON_CODES[refund.reasonCode] : "—"}</TableCell>
                  <TableCell>
                    {a.requestedBy.displayName}
                    {mine && (
                      <Badge variant="outline" className="ml-2">
                        you
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {refund ? <RefundStatusBadge status={refund.status} /> : <Badge variant="outline">{a.status}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <DecideButtons requestId={a.id} open={a.status === "PENDING"} />
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
