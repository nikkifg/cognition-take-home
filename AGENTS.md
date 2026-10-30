# AGENTS.md

Rules for every Devin (or other agent) session in this repo. The app lives in
`prototype/`; paths below are relative to it. Reviewers check the same rules in
[REVIEW.md](./REVIEW.md).

## Platform rules

1. **All data changes go through actions.** Define them with `defineAction`
   and call them with `runAction` (`src/platform/actions.ts`). Never call
   `db.<model>.create/update/delete/upsert` (or raw SQL) from pages, server
   actions, route handlers or components. Reads may use `db` directly.
   Exceptions: `prisma/seed.ts` and test fixtures in `tests/`.
2. **Every action declares a permission.** Use an existing permission or add
   one to your app's `permissions` in `src/apps.config.ts` (name it
   `<appId>.<thing>.<verb>` and list the roles that get it). Every action must
   call `ctx.audit(...)` with `before`/`after`; `runAction` rolls back actions
   that don't.
3. **Changes that need sign-off use approvals.** Call `requestApproval(ctx, …)`
   inside the action instead of applying the change, and register an
   `approvalHandlers` entry in `src/apps.config.ts` that applies it. Approvals
   go through `decideApproval`, which blocks self-approval and requires
   distinct approvers. Never apply an approval-gated change any other way.
4. **Sensitive fields use `<Masked>`.** Register the field under the app's
   `sensitiveFields` in `src/apps.config.ts` with its reveal permission, and
   render it with `<Masked app field entityId />` (`src/platform/masked.tsx`).
   Never send the raw value to the client, log it, or put it in an audit
   event. Reveals go through `revealField`, which checks the permission and
   writes an audit event.
5. **Apps register via `src/apps.config.ts`.** A new app adds its entry there,
   its pages under `src/app/<appId>/` and its domain code (actions, approval
   handlers, errors, policy) under `src/apps/<appId>/` (see
   [docs/playbook.md](./docs/playbook.md)). Do not edit `prisma/schema.prisma`
   or `src/platform/` unless the request needs it; if it does, say why in the
   PR description and keep the change minimal (add a migration with
   `npm run db:migrate -- --name <change>`).
6. **Authorization is server-side.** Check `can(user, permission)` in server
   code before showing data or controls; hiding a button is not access
   control. Get the user with `requireUser()` / `getCurrentUser()`.
7. **Synthetic data only.** Seed and test data must be obviously fake: `(Test)`
   names, `fintech.example` emails, `000-` SSNs, `TEST` references.

## Workflow

- **UI:** shadcn/ui components (`src/components/ui`) and plain tables. No custom
  design system, no generic DataTable.
- **Dependencies:** don't add one without a reason stated in the PR.
- **Before opening a PR:** from `prototype/`, run `npm run lint`,
  `npm run typecheck` and `npm test`, then start `npm run dev`, sign in as the
  relevant personas and check the change in the browser (including
  `/admin/audit` for anything that changes data).
- **Commits and PR titles:** Conventional Commits (`feat:`, `fix:`, `docs:`,
  `test:`, `chore:`, `refactor:`), e.g. `feat(kyc): claim and decide cases`.

## Running locally

```bash
cd prototype
nvm use                # Node 22
npm run setup          # install, .env, Prisma client, ./dev.db + seed data
npm run dev            # http://localhost:3000, sign in at /sign-in
npm test               # guardrail tests against a throwaway test.db
```
