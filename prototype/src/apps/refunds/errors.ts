import { PolicyError } from "@/platform/errors";

/** Refund blocked by its state, e.g. the transaction is already refunded. Audited as a denial. */
export class RefundStateError extends PolicyError {
  name = "RefundStateError";
}
