// Registered in apps.config.ts. Kept free of platform runtime imports because
// the registry loads apps.config.ts.
import type { ApprovalHandler } from "@/platform/types";
import { TXN_SETTLED } from "./policy";

type Payload = { refundId: string };

/** Approved: release the refund to the processor (status PENDING). */
export const approveRefund: ApprovalHandler = async (ctx, payload) => {
  const { refundId } = payload as Payload;
  const { count } = await ctx.tx.refundRequest.updateMany({
    where: { id: refundId, status: "PENDING_APPROVAL" },
    data: { status: "PENDING" },
  });
  if (count !== 1) throw new Error(`Refund ${refundId} is not awaiting approval`);
  await ctx.audit({
    action: "refunds.refund.approved",
    app: "refunds",
    entityType: "RefundRequest",
    entityId: refundId,
    before: { status: "PENDING_APPROVAL" },
    after: { status: "PENDING" },
  });
};

/** Rejected: close the refund and make the transaction refundable again. */
export const rejectRefund: ApprovalHandler = async (ctx, payload) => {
  const { refundId } = payload as Payload;
  const refund = await ctx.tx.refundRequest.findUniqueOrThrow({ where: { id: refundId } });
  if (refund.status !== "PENDING_APPROVAL") throw new Error(`Refund ${refundId} is not awaiting approval`);
  await ctx.tx.refundRequest.update({ where: { id: refundId }, data: { status: "REJECTED" } });
  await ctx.tx.transaction.update({ where: { id: refund.transactionId }, data: { status: TXN_SETTLED } });
  await ctx.audit({
    action: "refunds.refund.rejected",
    app: "refunds",
    entityType: "RefundRequest",
    entityId: refundId,
    before: { status: "PENDING_APPROVAL" },
    after: { status: "REJECTED", transactionStatus: TXN_SETTLED },
  });
};
