import { randomUUID } from "node:crypto";
import type { RefundReasonCode } from "@/generated/prisma/enums";
import { defineAction } from "@/platform/actions";
import { requestApproval } from "@/platform/approvals";
import { RefundStateError } from "./errors";
import {
  EXECUTE_APPROVAL_ACTION,
  REASON_CODES,
  TXN_REFUNDED,
  TXN_REFUND_PENDING,
  TXN_SETTLED,
  formatCents,
  isReasonCode,
} from "./policy";
import { getPaymentProcessor } from "./processor";

/**
 * Request a full refund. Every refund waits for another finance admin to approve it; once
 * approved it is PENDING and `processRefund` sends it to the processor.
 */
export const requestRefund = defineAction({
  name: "refunds.refund.request",
  app: "refunds",
  permission: "refunds.request",
  run: async (ctx, input: { transactionId: string; reasonCode: RefundReasonCode }) => {
    if (!isReasonCode(input.reasonCode)) throw new Error("A valid reason code is required");
    const txn = await ctx.tx.transaction.findUnique({ where: { id: input.transactionId } });
    if (!txn) throw new RefundStateError("Transaction not found");

    // Compare-and-set: only one refund can ever claim a settled transaction.
    const claimed = await ctx.tx.transaction.updateMany({
      where: { id: txn.id, status: TXN_SETTLED },
      data: { status: TXN_REFUND_PENDING },
    });
    if (claimed.count !== 1) {
      throw new RefundStateError(`Transaction ${txn.reference} is already refunded or has a refund in progress`);
    }

    const refund = await ctx.tx.refundRequest.create({
      data: {
        transactionId: txn.id,
        amountCents: txn.amountCents,
        reasonCode: input.reasonCode,
        status: "PENDING_APPROVAL",
        idempotencyKey: randomUUID(),
        requestedById: ctx.actor.id,
      },
    });
    await ctx.audit({
      entityType: "RefundRequest",
      entityId: refund.id,
      before: { transactionId: txn.id, transactionStatus: txn.status },
      after: {
        transactionId: txn.id,
        transactionStatus: TXN_REFUND_PENDING,
        status: refund.status,
        amountCents: refund.amountCents,
        reasonCode: refund.reasonCode,
      },
    });

    await requestApproval(ctx, {
      app: "refunds",
      action: EXECUTE_APPROVAL_ACTION,
      payload: { refundId: refund.id },
      summary: `Refund ${formatCents(txn.amountCents, txn.currency)} on ${txn.reference} (${REASON_CODES[input.reasonCode]})`,
      approverPermission: "refunds.approve",
      entityType: "RefundRequest",
      entityId: refund.id,
    });
    return refund;
  },
});

/**
 * Send a PENDING refund to the payment processor and record the outcome.
 * Safe to retry: the stored idempotency key means the processor creates at
 * most one refund however many times this runs.
 */
export const processRefund = defineAction({
  name: "refunds.refund.process",
  app: "refunds",
  permission: "refunds.execute",
  run: async (ctx, input: { refundId: string }) => {
    const refund = await ctx.tx.refundRequest.findUnique({
      where: { id: input.refundId },
      include: { transaction: true },
    });
    if (!refund) throw new RefundStateError("Refund not found");
    if (refund.status !== "PENDING") throw new RefundStateError(`Refund is ${refund.status}, not PENDING`);

    const result = await getPaymentProcessor().refund({
      idempotencyKey: refund.idempotencyKey,
      chargeReference: refund.transaction.reference,
      amountCents: refund.amountCents,
      currency: refund.transaction.currency,
    });

    const succeeded = result.status === "succeeded";
    const { count } = await ctx.tx.refundRequest.updateMany({
      where: { id: refund.id, status: "PENDING" },
      data: {
        status: succeeded ? "SUCCEEDED" : "FAILED",
        processorRef: result.id,
        failureReason: succeeded ? null : result.failureReason,
      },
    });
    if (count !== 1) throw new RefundStateError("Refund was processed concurrently");
    // A failed refund releases the transaction so it can be retried as a new request.
    const transactionStatus = succeeded ? TXN_REFUNDED : TXN_SETTLED;
    await ctx.tx.transaction.update({ where: { id: refund.transactionId }, data: { status: transactionStatus } });

    await ctx.audit({
      entityType: "RefundRequest",
      entityId: refund.id,
      before: { status: "PENDING", transactionStatus: refund.transaction.status },
      after: {
        status: succeeded ? "SUCCEEDED" : "FAILED",
        processorRef: result.id,
        transactionStatus,
        ...(succeeded ? {} : { failureReason: result.failureReason }),
      },
    });
    return ctx.tx.refundRequest.findUniqueOrThrow({ where: { id: refund.id } });
  },
});
