import { Badge } from "@/components/ui/badge";
import type { RefundStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/apps/refunds/policy";

const VARIANTS: Record<RefundStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_APPROVAL: "secondary",
  PENDING: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  REJECTED: "outline",
};

export function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return <Badge variant={VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
