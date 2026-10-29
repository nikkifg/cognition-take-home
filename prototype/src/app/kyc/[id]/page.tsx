import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { Masked } from "@/platform/masked";
import { can } from "@/platform/rbac";
import { requireUser } from "@/platform/session";
import { CLAIMABLE, SECOND_REVIEW } from "../_lib/case-actions";
import { claimCaseAction, decideCaseAction, secondReviewAction } from "../actions";
import { RiskBadge, StatusBadge } from "../_components/badges";
import { ClaimButton, DecisionForm, SecondReviewForm } from "../_components/case-forms";

const time = (d: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "—");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "kyc.view")) {
    return <p className="text-sm text-destructive">403: you need the kyc.view permission to see KYC cases.</p>;
  }
  const { id } = await params;
  const kycCase = await db.kycCase.findUnique({
    where: { id },
    include: {
      // Never select applicant.ssn here; <Masked> reads it server-side.
      applicant: {
        select: {
          id: true,
          displayName: true,
          country: true,
          riskLevel: true,
          idChecks: { orderBy: { checkedAt: "desc" } },
        },
      },
      claimedBy: true,
      decidedBy: true,
    },
  });
  if (!kycCase) return <p className="text-sm text-muted-foreground">Case not found.</p>;

  const { applicant } = kycCase;
  const requests = await db.approvalRequest.findMany({
    where: { entityType: "KycCase", entityId: kycCase.id, action: SECOND_REVIEW },
    include: { requestedBy: true, decisions: { include: { approver: true } } },
    orderBy: { createdAt: "desc" },
  });
  const pending = requests.find((r) => r.status === "PENDING");
  const history = await db.auditEvent.findMany({
    where: {
      OR: [
        { entityType: "KycCase", entityId: kycCase.id },
        { entityType: "ApprovalRequest", entityId: { in: requests.map((r) => r.id) } },
      ],
    },
    orderBy: { id: "asc" },
  });

  const isClaimant = kycCase.claimedById === user.id;
  const canClaim =
    CLAIMABLE.includes(kycCase.status) &&
    !kycCase.claimedById &&
    can(user, "kyc.case.claim") &&
    (kycCase.status !== "ESCALATED" || can(user, "kyc.escalation.claim"));
  const canDecide = kycCase.status === "IN_REVIEW" && isClaimant && can(user, "kyc.case.decide");
  const canSecondReview =
    !!pending && can(user, SECOND_REVIEW) && can(user, "approvals.decide");

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/kyc" className="text-sm text-primary hover:underline">
          ← Queue
        </Link>
        <h1 className="font-mono text-2xl font-semibold">{kycCase.reference}</h1>
        <StatusBadge status={kycCase.status} />
        <RiskBadge risk={applicant.riskLevel} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applicant</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Field label="Name">{applicant.displayName}</Field>
              <Field label="Country">{applicant.country}</Field>
              <Field label="Risk level">
                <RiskBadge risk={applicant.riskLevel} />
              </Field>
              <Field label="SSN">
                <Masked app="kyc" field="applicant.ssn" entityId={applicant.id} />
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Case</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Field label="Status">
                <StatusBadge status={kycCase.status} />
              </Field>
              <Field label="Claimed by">{kycCase.claimedBy?.displayName ?? "—"}</Field>
              <Field label="Claimed at">{time(kycCase.claimedAt)}</Field>
              <Field label="Reason">{kycCase.decisionReason ?? "—"}</Field>
              <Field label="Decided by">{kycCase.decidedBy?.displayName ?? "—"}</Field>
              <Field label="Decided at">{time(kycCase.decidedAt)}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      {(canClaim || canDecide || kycCase.status === "PENDING_SECOND_REVIEW" || kycCase.status === "IN_REVIEW") && (
        <Card>
          <CardHeader>
            <CardTitle>{kycCase.status === "PENDING_SECOND_REVIEW" ? "Second review" : "Review"}</CardTitle>
            {kycCase.status === "PENDING_SECOND_REVIEW" && pending && (
              <CardDescription>
                Requested by {pending.requestedBy.displayName} at {time(pending.createdAt)}. A different senior reviewer
                must approve (four-eyes).
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {canClaim && <ClaimButton action={claimCaseAction.bind(null, kycCase.id)} size="default" />}
            {canDecide && (
              <DecisionForm action={decideCaseAction.bind(null, kycCase.id)} highRisk={applicant.riskLevel === "HIGH"} />
            )}
            {kycCase.status === "IN_REVIEW" && !isClaimant && (
              <p className="text-sm text-muted-foreground">
                Claimed by {kycCase.claimedBy?.displayName}. Only they can decide this case.
              </p>
            )}
            {kycCase.status === "PENDING_SECOND_REVIEW" &&
              (canSecondReview && pending ? (
                <div className="flex flex-col gap-3">
                  {pending.requestedById === user.id && (
                    <p className="text-sm text-destructive">
                      You requested this approval. The four-eyes rule blocks self-approval.
                    </p>
                  )}
                  <SecondReviewForm action={secondReviewAction.bind(null, pending.id)} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Waiting for a senior reviewer.</p>
              ))}
          </CardContent>
        </Card>
      )}

      <h2 className="text-lg font-semibold">ID checks</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Checked (UTC)</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Match score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applicant.idChecks.map((check) => (
              <TableRow key={check.id}>
                <TableCell className="font-mono text-xs">{time(check.checkedAt)}</TableCell>
                <TableCell>{check.provider}</TableCell>
                <TableCell>{check.documentType}</TableCell>
                <TableCell>{check.result}</TableCell>
                <TableCell>{check.matchScore}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="text-lg font-semibold">History</h2>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No changes recorded in the audit log yet.
                </TableCell>
              </TableRow>
            )}
            {history.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{time(e.createdAt)}</TableCell>
                <TableCell>{e.actorEmail}</TableCell>
                <TableCell className="font-mono text-xs">{e.action}</TableCell>
                <TableCell className="whitespace-normal">{e.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function KycCasePage(props: PageProps<"/kyc/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <CaseDetail params={props.params} />
    </Suspense>
  );
}
