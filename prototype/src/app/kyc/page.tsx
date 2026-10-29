import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { can } from "@/platform/rbac";
import type { Actor } from "@/platform/roles";
import { requireUser } from "@/platform/session";
import { CLAIMABLE } from "./_lib/case-actions";
import { claimCaseAction } from "./actions";
import { RiskBadge, StatusBadge } from "./_components/badges";
import { ClaimButton } from "./_components/case-forms";

const VIEWS = {
  active: { label: "Active", where: () => ({ status: { in: ["OPEN", "IN_REVIEW", "PENDING_SECOND_REVIEW", "ESCALATED"] } }) },
  mine: { label: "Claimed by me", where: (u: Actor) => ({ claimedById: u.id, status: "IN_REVIEW" }) },
  second: { label: "Awaiting second review", where: () => ({ status: "PENDING_SECOND_REVIEW" }) },
  escalated: { label: "Escalated", where: () => ({ status: "ESCALATED" }) },
  closed: { label: "Closed", where: () => ({ status: { in: ["APPROVED", "REJECTED"] } }) },
} satisfies Record<string, { label: string; where: (u: Actor) => Prisma.KycCaseWhereInput }>;
type View = keyof typeof VIEWS;

const date = (d: Date) => d.toISOString().slice(0, 10);

async function Queue({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  if (!can(user, "kyc.view")) {
    return <p className="text-sm text-destructive">403: you need the kyc.view permission to see the KYC queue.</p>;
  }
  const param = (await searchParams).view;
  const view: View = param && param in VIEWS ? (param as View) : "active";
  const cases = await db.kycCase.findMany({
    where: VIEWS[view].where(user),
    include: { applicant: true, claimedBy: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Button key={v} asChild size="sm" variant={v === view ? "default" : "outline"}>
            <Link href={v === "active" ? "/kyc" : `/kyc?view=${v}`}>{VIEWS[v].label}</Link>
          </Button>
        ))}
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Applicant</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Claimed by</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  No cases.
                </TableCell>
              </TableRow>
            )}
            {cases.map((c) => {
              const claimable =
                CLAIMABLE.includes(c.status) &&
                !c.claimedById &&
                can(user, "kyc.case.claim") &&
                (c.status !== "ESCALATED" || can(user, "kyc.escalation.claim"));
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/kyc/${c.id}`} className="font-mono text-xs text-primary hover:underline">
                      {c.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{c.applicant.displayName}</TableCell>
                  <TableCell>{c.applicant.country}</TableCell>
                  <TableCell>
                    <RiskBadge risk={c.applicant.riskLevel} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell>{c.claimedBy?.displayName ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{date(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {claimable ? (
                      <ClaimButton action={claimCaseAction.bind(null, c.id)} />
                    ) : (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/kyc/${c.id}`}>Open</Link>
                      </Button>
                    )}
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

export default function KycQueuePage(props: PageProps<"/kyc">) {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">KYC review queue</h1>
        <p className="text-sm text-muted-foreground">
          Claim a case, then approve, reject or escalate it with a reason. High-risk approvals need a second reviewer.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Queue searchParams={props.searchParams as Promise<{ view?: string }>} />
      </Suspense>
    </>
  );
}
