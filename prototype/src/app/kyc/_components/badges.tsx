import { Badge } from "@/components/ui/badge";
import type { KycCaseStatus, RiskLevel } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<KycCaseStatus, string> = {
  OPEN: "Open",
  IN_REVIEW: "In review",
  PENDING_SECOND_REVIEW: "Awaiting second review",
  ESCALATED: "Escalated",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export function StatusBadge({ status }: { status: KycCaseStatus }) {
  const variant =
    status === "APPROVED" ? "default" : status === "REJECTED" ? "destructive" : status === "OPEN" ? "outline" : "secondary";
  return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge variant={risk === "HIGH" ? "destructive" : risk === "MEDIUM" ? "secondary" : "outline"}>{risk}</Badge>;
}
