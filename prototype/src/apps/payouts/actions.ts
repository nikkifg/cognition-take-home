import { defineAction } from "@/platform/actions";
import { requestApproval } from "@/platform/approvals";
import { PayoutChangeError } from "./errors";
import {
  BANK_CHANGE_APPROVAL,
  PAYEE_ACTIVE,
  PAYEE_CHANGE_PENDING,
  bankSnapshot,
  validateBankDetails,
} from "./policy";

export type BankChangeInput = {
  payeeId: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  reason: string;
};

/**
 * Request a new payout bank account for a payee. Nothing changes on the payee
 * until a different finance admin approves; the payee is held (CHANGE_PENDING)
 * so only one change can be pending at a time.
 */
export const requestBankChange = defineAction({
  name: "payouts.bank_change.request",
  app: "payouts",
  permission: "payouts.bank_change.request",
  run: async (ctx, input: BankChangeInput) => {
    const details = {
      bankName: input.bankName?.trim() ?? "",
      routingNumber: input.routingNumber?.trim() ?? "",
      accountNumber: input.accountNumber?.trim() ?? "",
    };
    const reason = input.reason?.trim();
    const invalid = validateBankDetails(details);
    if (invalid) throw new PayoutChangeError(invalid);
    if (!reason) throw new PayoutChangeError("A reason is required.");

    const payee = await ctx.tx.payee.findUnique({ where: { id: input.payeeId } });
    if (!payee) throw new PayoutChangeError("Payee not found");
    if (payee.routingNumber === details.routingNumber && payee.accountNumber === details.accountNumber) {
      throw new PayoutChangeError(`${payee.reference} already pays out to that account.`);
    }

    // Compare-and-set: only one change can claim an active payee.
    const claimed = await ctx.tx.payee.updateMany({
      where: { id: payee.id, status: PAYEE_ACTIVE },
      data: { status: PAYEE_CHANGE_PENDING },
    });
    if (claimed.count !== 1) {
      throw new PayoutChangeError(`${payee.reference} already has a bank account change waiting for approval.`);
    }

    const change = await ctx.tx.bankAccountChange.create({
      data: {
        payeeId: payee.id,
        oldBankName: payee.bankName,
        oldRoutingNumber: payee.routingNumber,
        oldAccountNumber: payee.accountNumber,
        newBankName: details.bankName,
        newRoutingNumber: details.routingNumber,
        newAccountNumber: details.accountNumber,
        reason,
        requestedById: ctx.actor.id,
      },
    });
    await ctx.audit({
      entityType: "BankAccountChange",
      entityId: change.id,
      before: { payeeId: payee.id, payeeStatus: PAYEE_ACTIVE, ...bankSnapshot(payee) },
      after: { status: change.status, payeeStatus: PAYEE_CHANGE_PENDING, ...bankSnapshot(details) },
      reason,
    });
    await requestApproval(ctx, {
      app: "payouts",
      action: BANK_CHANGE_APPROVAL,
      payload: { changeId: change.id },
      summary: `Change payout bank account for ${payee.name} (${payee.reference}) to ${details.bankName}`,
      approverPermission: "payouts.bank_change.approve",
      entityType: "BankAccountChange",
      entityId: change.id,
    });
    return change;
  },
});
