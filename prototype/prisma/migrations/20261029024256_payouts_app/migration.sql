-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "routingNumber" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankAccountChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payeeId" TEXT NOT NULL,
    "oldBankName" TEXT NOT NULL,
    "oldRoutingNumber" TEXT NOT NULL,
    "oldAccountNumber" TEXT NOT NULL,
    "newBankName" TEXT NOT NULL,
    "newRoutingNumber" TEXT NOT NULL,
    "newAccountNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccountChange_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankAccountChange_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Payee_reference_key" ON "Payee"("reference");

-- CreateIndex
CREATE INDEX "BankAccountChange_status_idx" ON "BankAccountChange"("status");

-- CreateIndex
CREATE INDEX "BankAccountChange_payeeId_idx" ON "BankAccountChange"("payeeId");
