import { Badge } from "@/components/ui/badge";
import type { BankAccountChangeStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/apps/payouts/policy";

const VARIANTS: Record<BankAccountChangeStatus, "default" | "secondary" | "outline"> = {
  PENDING_APPROVAL: "secondary",
  APPROVED: "default",
  REJECTED: "outline",
};

export function ChangeStatusBadge({ status }: { status: BankAccountChangeStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
