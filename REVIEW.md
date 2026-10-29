# REVIEW.md

Checks for reviewing any PR in this repo (human or Devin Review). Each maps to
a rule in [AGENTS.md](./AGENTS.md). Paths are relative to `prototype/`.

## Must pass

- [ ] **Data changes go through actions.** No `db.<model>.create/update/delete/upsert`,
      `$executeRaw` or similar outside `defineAction` / `runAction`
      (`prisma/seed.ts` and `tests/` excepted). Watch server actions, route
      handlers and `"use server"` files.
- [ ] **Every action declares a permission** that exists in `src/apps.config.ts`
      or `PLATFORM_PERMISSIONS`, granted to the narrowest sensible roles.
- [ ] **Every action audits** the change with `ctx.audit({ entityType, entityId, before, after })`.
      Audit events never contain sensitive values.
- [ ] **Approvals can't be bypassed.** Flag any way around them: applying an
      approval-gated change directly, a second code path that skips
      `requestApproval`, editing `ApprovalRequest`/`ApprovalDecision` outside
      `decideApproval`, an `approvalHandlers` entry reachable without approval,
      a missing self-approval check, or `requiredApprovals` lowered without
      a stated reason.
- [ ] **No unmasked sensitive field.** Flag any SSN, ID number, account or card
      number, date of birth or similar PII rendered, returned from a server
      action/route, logged, or passed to a client component without `<Masked>`.
      New sensitive columns must be registered in `sensitiveFields` with a
      reveal permission.
- [ ] **Reveals require permission and are audited** (go through `revealField`).
- [ ] **Authorization is server-side** (`can` / `runAction`), not only hidden UI.
- [ ] **App boundaries.** New apps register in `src/apps.config.ts`. Changes to
      `prisma/schema.prisma` or `src/platform/` are needed by the request and
      explained in the PR description; schema changes ship with a migration.
      The audit log stays append-only (no update/delete path, triggers intact).
- [ ] **No new dependency without a stated reason** in the PR description.
- [ ] **Synthetic data only** in seeds, tests and screenshots.
- [ ] **Tests:** lint, typecheck and `npm test` pass; new actions have tests for
      permission denied and the audit event; approval flows test self-approval.
- [ ] **Checked in the browser** (PR says which personas/pages were checked).
- [ ] **UI** uses shadcn/ui and plain tables; no custom design system.
- [ ] **Conventional Commits** for commit messages and the PR title.
