-- Refunds are handled by finance admins only: the support agent role is
-- removed and finance approvers become finance admins. Support agents only
-- ever held refunds permissions, so their (synthetic) refund requests and
-- approvals go with them; the append-only audit log keeps the history.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

UPDATE "Transaction" SET "status" = 'SETTLED'
WHERE "id" IN (
    SELECT "transactionId" FROM "RefundRequest"
    WHERE "status" IN ('PENDING', 'PENDING_APPROVAL')
      AND "requestedById" IN (SELECT "id" FROM "User" WHERE "role" = 'support_agent')
);
DELETE FROM "ApprovalDecision" WHERE "requestId" IN (
    SELECT "id" FROM "ApprovalRequest" WHERE "requestedById" IN (SELECT "id" FROM "User" WHERE "role" = 'support_agent')
);
DELETE FROM "ApprovalRequest" WHERE "requestedById" IN (SELECT "id" FROM "User" WHERE "role" = 'support_agent');
DELETE FROM "RefundRequest" WHERE "requestedById" IN (SELECT "id" FROM "User" WHERE "role" = 'support_agent');
DELETE FROM "User" WHERE "role" = 'support_agent';

-- Rename the seeded finance.approverN personas to finance.adminN.
UPDATE "ApprovalRequest" SET "requestedById" = 'finance.admin' || substr("requestedById", 17) WHERE "requestedById" LIKE 'finance.approver%';
UPDATE "ApprovalDecision" SET "approverId" = 'finance.admin' || substr("approverId", 17) WHERE "approverId" LIKE 'finance.approver%';
UPDATE "RefundRequest" SET "requestedById" = 'finance.admin' || substr("requestedById", 17) WHERE "requestedById" LIKE 'finance.approver%';
UPDATE "KycCase" SET "claimedById" = 'finance.admin' || substr("claimedById", 17) WHERE "claimedById" LIKE 'finance.approver%';
UPDATE "KycCase" SET "decidedById" = 'finance.admin' || substr("decidedById", 17) WHERE "decidedById" LIKE 'finance.approver%';
UPDATE "FlagValue" SET "updatedById" = 'finance.admin' || substr("updatedById", 17) WHERE "updatedById" LIKE 'finance.approver%';
UPDATE "FlagChange" SET "changedById" = 'finance.admin' || substr("changedById", 17) WHERE "changedById" LIKE 'finance.approver%';
UPDATE "User" SET
    "id" = 'finance.admin' || substr("id", 17),
    "email" = 'finance.admin' || substr("email", 17),
    "displayName" = replace("displayName", 'Finance Approver', 'Finance Admin')
WHERE "id" LIKE 'finance.approver%';
UPDATE "User" SET "role" = 'finance_admin' WHERE "role" = 'finance_approver';

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
