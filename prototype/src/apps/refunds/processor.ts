// Payment processor boundary. Production would wrap Stripe's Refunds API
// (which takes an Idempotency-Key header); the prototype uses an in-memory mock.

export type ProcessorRefundRequest = {
  /** Same key => same refund. Retries must reuse the key of the original attempt. */
  idempotencyKey: string;
  chargeReference: string;
  amountCents: number;
  currency: string;
};

export type ProcessorRefundResult =
  | { id: string; status: "succeeded" }
  | { id: string; status: "failed"; failureReason: string };

export interface PaymentProcessor {
  refund(request: ProcessorRefundRequest): Promise<ProcessorRefundResult>;
}

/**
 * Mock processor. Declines amounts ending in .13 so the failed path can be
 * exercised. Replays the stored result for a repeated idempotency key and
 * rejects a reused key with different parameters, like Stripe does.
 */
export class MockPaymentProcessor implements PaymentProcessor {
  private readonly byKey = new Map<string, { request: ProcessorRefundRequest; result: ProcessorRefundResult }>();
  /** Every call, including idempotent replays. */
  calls = 0;

  /** Refunds actually created (one per idempotency key). */
  get refundsCreated(): number {
    return this.byKey.size;
  }

  async refund(request: ProcessorRefundRequest): Promise<ProcessorRefundResult> {
    this.calls++;
    const existing = this.byKey.get(request.idempotencyKey);
    if (existing) {
      const { request: prev } = existing;
      if (
        prev.chargeReference !== request.chargeReference ||
        prev.amountCents !== request.amountCents ||
        prev.currency !== request.currency
      ) {
        throw new Error("Idempotency key reused with different parameters");
      }
      return existing.result;
    }
    const id = `mockpay_re_${String(this.byKey.size + 1).padStart(6, "0")}_${request.idempotencyKey.slice(0, 8)}`;
    const result: ProcessorRefundResult =
      request.amountCents % 100 === 13
        ? { id, status: "failed", failureReason: "card_declined (mock: amounts ending in .13 are declined)" }
        : { id, status: "succeeded" };
    this.byKey.set(request.idempotencyKey, { request, result });
    return result;
  }
}

const globalForProcessor = globalThis as unknown as { paymentProcessor?: PaymentProcessor };

export function getPaymentProcessor(): PaymentProcessor {
  return (globalForProcessor.paymentProcessor ??= new MockPaymentProcessor());
}

/** Test-only: swap in a fresh processor. */
export function setPaymentProcessorForTesting(processor: PaymentProcessor) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setPaymentProcessorForTesting is only available in tests");
  }
  globalForProcessor.paymentProcessor = processor;
}
