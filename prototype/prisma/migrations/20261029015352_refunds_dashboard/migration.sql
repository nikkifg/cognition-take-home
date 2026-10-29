-- Refunds dashboard: reason codes, processor statuses and a sensitive customer
-- email. Existing rows are backfilled so the migration works on a populated
-- dev.db: free-text reasons become OTHER, old statuses map to the new ones and
-- customer emails are derived synthetic addresses. Old REQUESTED rows have no
-- approval request, so they become REJECTED and free their transaction.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RefundRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "processorRef" TEXT,
    "failureReason" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefundRequest_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefundRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RefundRequest" ("amountCents", "createdAt", "id", "idempotencyKey", "processorRef", "reasonCode", "requestedById", "status", "transactionId", "updatedAt")
SELECT "amountCents", "createdAt", "id", "idempotencyKey", "processorRef", 'OTHER', "requestedById",
    CASE "status"
        WHEN 'PROCESSED' THEN 'SUCCEEDED'
        WHEN 'APPROVED' THEN 'PENDING'
        WHEN 'REQUESTED' THEN 'REJECTED'
        ELSE "status"
    END,
    "transactionId", "updatedAt"
FROM "RefundRequest";
DROP TABLE "RefundRequest";
ALTER TABLE "new_RefundRequest" RENAME TO "RefundRequest";
CREATE UNIQUE INDEX "RefundRequest_idempotencyKey_key" ON "RefundRequest"("idempotencyKey");
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");
CREATE INDEX "RefundRequest_transactionId_idx" ON "RefundRequest"("transactionId");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'SETTLED',
    "createdAt" DATETIME NOT NULL
);
INSERT INTO "new_Transaction" ("amountCents", "createdAt", "currency", "customerEmail", "customerRef", "id", "reference", "status")
SELECT t."amountCents", t."createdAt", t."currency", lower(t."customerRef") || '@fintech.example', t."customerRef", t."id", t."reference",
    CASE
        WHEN EXISTS (SELECT 1 FROM "RefundRequest" r WHERE r."transactionId" = t."id" AND r."status" = 'SUCCEEDED') THEN 'REFUNDED'
        WHEN EXISTS (SELECT 1 FROM "RefundRequest" r WHERE r."transactionId" = t."id" AND r."status" = 'PENDING') THEN 'REFUND_PENDING'
        ELSE t."status"
    END
FROM "Transaction" t;
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");
CREATE INDEX "Transaction_customerRef_idx" ON "Transaction"("customerRef");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
