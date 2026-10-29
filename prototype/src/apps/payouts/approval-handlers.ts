// Registered in apps.config.ts. Kept free of platform runtime imports because
// the registry loads apps.config.ts.
import type { ApprovalHandler } from "@/platform/types";
import { PAYEE_ACTIVE, PAYEE_CHANGE_PENDING, bankSnapshot } from "./policy";

type Payload = { changeId: string };

/** Approved: switch the payee to the new bank account and release the hold. */
export const applyBankChange: ApprovalHandler = async (ctx, payload) => {
  const { changeId } = payload as Payload;
  const { count } = await ctx.tx.bankAccountChange.updateMany({
    where: { id: changeId, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED" },
  });
  if (count !== 1) throw new Error(`Bank account change ${changeId} is not awaiting approval`);
  const change = await ctx.tx.bankAccountChange.findUniqueOrThrow({ where: { id: changeId } });
  const applied = await ctx.tx.payee.updateMany({
    where: { id: change.payeeId, status: PAYEE_CHANGE_PENDING },
    data: {
      bankName: change.newBankName,
      routingNumber: change.newRoutingNumber,
      accountNumber: change.newAccountNumber,
      status: PAYEE_ACTIVE,
    },
  });
  if (applied.count !== 1) throw new Error(`Payee ${change.payeeId} is not held for this change`);
  await ctx.audit({
    action: "payouts.bank_change.approved",
    app: "payouts",
    entityType: "BankAccountChange",
    entityId: changeId,
    before: {
      status: "PENDING_APPROVAL",
      payeeStatus: PAYEE_CHANGE_PENDING,
      ...bankSnapshot({ bankName: change.oldBankName, routingNumber: change.oldRoutingNumber }),
    },
    after: {
      status: "APPROVED",
      payeeStatus: PAYEE_ACTIVE,
      ...bankSnapshot({ bankName: change.newBankName, routingNumber: change.newRoutingNumber }),
    },
  });
};

/** Rejected: close the change; the payee keeps its current account and accepts new requests. */
export const rejectBankChange: ApprovalHandler = async (ctx, payload) => {
  const { changeId } = payload as Payload;
  const { count } = await ctx.tx.bankAccountChange.updateMany({
    where: { id: changeId, status: "PENDING_APPROVAL" },
    data: { status: "REJECTED" },
  });
  if (count !== 1) throw new Error(`Bank account change ${changeId} is not awaiting approval`);
  const change = await ctx.tx.bankAccountChange.findUniqueOrThrow({ where: { id: changeId } });
  await ctx.tx.payee.updateMany({
    where: { id: change.payeeId, status: PAYEE_CHANGE_PENDING },
    data: { status: PAYEE_ACTIVE },
  });
  await ctx.audit({
    action: "payouts.bank_change.rejected",
    app: "payouts",
    entityType: "BankAccountChange",
    entityId: changeId,
    before: { status: "PENDING_APPROVAL", payeeStatus: PAYEE_CHANGE_PENDING },
    after: { status: "REJECTED", payeeStatus: PAYEE_ACTIVE },
  });
};
