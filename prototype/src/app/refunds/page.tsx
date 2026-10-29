import { Suspense } from "react";
import Form from "next/form";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { REASON_CODES, TXN_SETTLED, formatCents } from "@/apps/refunds/policy";
import { Masked } from "@/platform/masked";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { RetryButton } from "./action-buttons";
import { RefundDialog } from "./refund-dialog";
import { RefundStatusBadge } from "./status-badge";

const PAGE_SIZE = 50;

/** Matches transaction or customer reference, or an exact amount like "400" or "42.13". */
function searchWhere(q: string): Prisma.TransactionWhereInput {
  if (!q) return {};
  const or: Prisma.TransactionWhereInput[] = [{ reference: { contains: q } }, { customerRef: { contains: q } }];
  const amount = q.replace(/^\$/, "");
  if (/^\d+(\.\d{1,2})?$/.test(amount)) or.push({ amountCents: Math.round(Number(amount) * 100) });
  return { OR: or };
}

async function Transactions({ searchParams }: { searchParams: PageProps<"/refunds">["searchParams"] }) {
  const user = await requireUser();
  if (!can(user, "refunds.view")) {
    return <p className="text-sm text-destructive">403: you need the refunds.view permission.</p>;
  }
  const { q: rawQ } = await searchParams;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 100) ?? "";
  const canRequest = can(user, "refunds.request");
  const canExecute = can(user, "refunds.execute");

  const txns = await db.transaction.findMany({
    where: searchWhere(q),
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    include: {
      refundRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { requestedBy: { select: { displayName: true } } },
      },
    },
  });
  const shown = txns.slice(0, PAGE_SIZE);

  return (
    <>
      <Form action="/refunds" className="flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Search TXN-/CUST- reference or amount" aria-label="Search" />
        <Button type="submit">Search</Button>
      </Form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date (UTC)</TableHead>
              <TableHead>Refund status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No transactions match “{q}”.
                </TableCell>
              </TableRow>
            )}
            {shown.map((t) => {
              const refund = t.refundRequests[0];
              const amount = formatCents(t.amountCents, t.currency);
              return (
                <TableRow key={t.id} className="align-top">
                  <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">{t.customerRef}</div>
                    <Masked app="refunds" field="transaction.customerEmail" entityId={t.id} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{amount}</TableCell>
                  <TableCell className="font-mono text-xs">{t.createdAt.toISOString().slice(0, 10)}</TableCell>
                  <TableCell>
                    {refund ? (
                      <div className="flex flex-col items-start gap-1">
                        <RefundStatusBadge status={refund.status} />
                        <span className="text-xs text-muted-foreground">
                          {REASON_CODES[refund.reasonCode]} · {refund.requestedBy.displayName}
                        </span>
                        {refund.failureReason && (
                          <span className="text-xs text-destructive">{refund.failureReason}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not refunded</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canRequest && (
                      <RefundDialog
                        transactionId={t.id}
                        reference={t.reference}
                        amount={amount}
                        refundable={t.status === TXN_SETTLED}
                      />
                    )}
                    {canExecute && refund && (
                      <RetryButton refundId={refund.id} open={refund.status === "PENDING"} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {txns.length > PAGE_SIZE && (
        <p className="text-sm text-muted-foreground">Showing the {PAGE_SIZE} most recent matches. Refine the search.</p>
      )}
    </>
  );
}

export default function RefundsPage({ searchParams }: PageProps<"/refunds">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Transactions searchParams={searchParams} />
    </Suspense>
  );
}
