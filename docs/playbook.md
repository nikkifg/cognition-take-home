# Playbook: add an internal app to the platform

Use this to turn a few sentences about a new internal app into a working app on
the platform in `prototype/`. Paths below are relative to `prototype/`. The rules
are in [AGENTS.md](../AGENTS.md) and reviewers check [REVIEW.md](../REVIEW.md);
this playbook says how to follow them, step by step.

## 1. The brief (what the requester writes)

A few sentences that answer:

- **What it does:** the records it works on and the things people do to them.
- **Who uses it:** which teams or roles view it and which ones act in it.
- **What needs approval:** which changes need sign-off, by whom, and how many approvers.
- **What's sensitive:** fields that must be masked, and who may reveal them.

Example:

> A feature-flag admin panel. Engineers see every flag with its dev, staging and
> prod values and can toggle dev and staging directly. Turning a flag on or off
> in prod needs approval from a different engineer. Admins can view flags but
> not change them.

Anything the brief leaves out falls back to the defaults in step 2. Don't stop
to ask about it.

## 2. Turn the brief into an app spec (before writing code)

Write this spec in the PR description and build from it. If the brief is
ambiguous on **who can approve**, **what an approval applies**, or **what
counts as sensitive**, ask the requester before building. Those choices are
hard to change later. Decide everything else yourself and list it under
"Assumptions" in the PR.

| Spec item | How to fill it in |
|---|---|
| `id` | Short lowercase noun (`flags`, `payouts`). Used for the route, the permission prefix and the audit `app` value. |
| Roles | Reuse the roles in `src/platform/roles.ts`. Add a role only if the brief names a group none of them covers (see step 4). |
| Permissions | One per thing a user can do, named `<id>.<thing>.<verb>` (`flags.prod.request`). Always add `<id>.view`. Add `<id>.audit.view` if a role other than admin should read this app's audit events. |
| Actions | Every state change in the brief becomes an action that declares one permission. |
| Approvals | For each approval-gated change: the handler key, the approver permission, `requiredApprovals` (default 1, and never the requester), what the approval handler applies, and what a rejection undoes. |
| Sensitive fields | Each PII or secret column: the reveal permission and the mask. |
| Data | New Prisma models and enums. Reuse existing tables when they already hold the data. |

Defaults when the brief says nothing:

- **Least privilege.** Admin gets `<id>.view` (plus the audit log through
  `audit.view`) but not the permissions that change data.
- **One uniform rule.** Prefer "every X needs approval" to amount or risk
  tiers unless the brief asks for tiers. Earlier tiers confused users and were
  dropped from refunds.
- **Reasons.** Decisions that close, reject or approve something require a
  reason, which goes in the audit event.
- **No hard deletes.** Use a status field instead.
- **No external calls.** Real vendors (payments, KYC, email) sit behind an
  interface with a mock implementation, like `PaymentProcessor` in refunds.

## 3. File layout

```
src/apps.config.ts                    # registry entry (navigation, permissions, sensitive fields, handlers)
src/apps/<id>/actions.ts              # defineAction(...) domain actions
src/apps/<id>/approval-handlers.ts    # approve/reject handlers (type-only platform imports)
src/apps/<id>/policy.ts               # constants and labels shared by server and UI (no server imports)
src/apps/<id>/errors.ts               # <Thing>StateError extends PolicyError
src/app/<id>/page.tsx (+ layout, [id]/page.tsx)
src/app/<id>/actions.ts               # "use server" wrappers around runAction
prisma/schema.prisma + migration      # only if the app needs new tables
prisma/seed.ts                        # synthetic data for the app
tests/<id>.test.ts (+ tests/fixtures.ts helpers)
```

Refunds uses this layout. KYC predates it and keeps its domain code in
`src/app/kyc/_lib/`. Both work; new apps should use `src/apps/<id>/`.

## 4. Build steps

Work through these in order. Each step names the existing code to copy.

1. **Branch:** `git checkout -b devin/$(date +%s)-<id>-app`. Run
   `nvm use 22` in `prototype/` and set it up as described in the
   [AGENTS.md](../AGENTS.md#running-locally) "Running locally" section.

2. **Schema (if needed).** Add a `// ── <App> ──` section to
   `prisma/schema.prisma` and run `npm run db:migrate -- --name <id>_app`. If
   you add required columns or enum values to tables that already have rows,
   write backfill SQL in the migration. The local `dev.db` is already
   populated.
   Mark sensitive columns with a `// sensitive: render with <Masked>` comment.

3. **Register the app** in `src/apps.config.ts`. Copy the `kyc` and `refunds`
   entries:
   - `id`, `name`, `description`, `href: "/<id>"`, `viewPermission: "<id>.view"`.
   - Set `status: "planned"` until the pages exist, then `"live"` (this
     controls the sidebar link).
   - `permissions`: every name starts with `<id>.` (the registry throws
     otherwise) and is granted to the narrowest roles.
   - `sensitiveFields`: `"<model>.<field>": { label, permission, read, mask }`.
     `read` selects only that column.
   - `approvalHandlers` / `rejectionHandlers`: keyed by the handler key you
     pass to `requestApproval`.

4. **Roles (only if needed).** A new role is a platform change. Add it to the
   `Role` enum (with a migration), `ROLES` and `ROLE_LABELS` in
   `src/platform/roles.ts`, and a `(Test)` persona in `src/platform/personas.ts`.
   **If the role approves anything, also add it to `approvals.decide` in
   `PLATFORM_PERMISSIONS` (`src/platform/rbac.ts`).** `decideApproval` needs both
   that permission and the request's own approver permission. Explain the
   change in the PR.
   Approval flows need **two** personas with the approver role so one can
   request and the other can approve.

5. **Domain actions** in `src/apps/<id>/actions.ts`. Copy `claimCase` /
   `decideCase` (`src/app/kyc/_lib/case-actions.ts`) and
   `requestRefund` / `processRefund` (refunds):
   - `defineAction({ name: "<id>.<thing>.<verb>", app: "<id>", permission, run })`.
   - Write only through `ctx.tx`. Never call `db` writes outside an action.
   - Validate input and state, then throw a `PolicyError` subclass
     (`<Thing>StateError`) for "not allowed right now" errors. `runAction` audits
     these as `action.denied`, and the UI shows the message.
   - Use a compare-and-set for anything two people could race on:
     `updateMany({ where: { id, status: <expected> } })` and check `count === 1`.
   - Call `ctx.audit({ entityType, entityId, before, after, reason })` with
     snapshots that **leave out sensitive fields**. Add a `snapshot()` helper
     like `caseSnapshot`. An action that doesn't audit is rolled back.
   - Permission checks that depend on the record (such as escalated cases)
     use `can(actor, …)` and throw `ForbiddenError`.

6. **Approvals.** In the action, don't apply the gated change. Put the record
   in a pending state and call
   `requestApproval(ctx, { app, action: <handler key>, payload: { id }, summary, approverPermission, requiredApprovals?, entityType, entityId })`.
   Then, in `src/apps/<id>/approval-handlers.ts`:
   - The approve handler applies the change only if the record is still pending
     (compare-and-set), and audits it with an explicit `action` and `app`.
   - The reject handler releases whatever the request put on hold (status,
     locks) and audits it.
   - Import only **types**, errors and `policy.ts` constants here. Importing
     `@/platform/actions`, `approvals` or `registry` creates an import cycle,
     because the registry loads `apps.config.ts`.
   - Don't add any other path that applies the change. Only `decideApproval`
     calls these handlers, and it blocks self-approval, decisions without
     permission, repeat decisions and decisions on closed requests.
   - If the brief requires extra separation (for example, the approver must
     not be the person who claimed the record), check it in the handler and
     throw `SelfApprovalError`, as `applySecondApproval` does.

7. **Server actions** in `src/app/<id>/actions.ts` (`"use server"`). Copy
   `src/app/kyc/actions.ts`: `requireUser()`, parse the form, call
   `runAction(...)`, catch `PolicyError` and return `{ error: message }`, then
   `revalidatePath` or `refresh()`. Approval decisions call
   `runAction(decideApproval, user, { requestId, decision, comment })` after
   checking that the request's `app` is `<id>`.

8. **Pages** under `src/app/<id>/`. Copy `src/app/kyc/page.tsx`:
   - Put data-reading components inside `<Suspense>`. Get the user with
     `requireUser()`, which calls `connection()`; this is required because
     Cache Components is on. Check `can(user, "<id>.view")` and render a 403
     message if the check fails.
   - Reads may use `db` directly. Show buttons only when `can(...)` allows the
     action; the action checks the permission again on the server.
   - Render sensitive fields with
     `<Masked app="<id>" field="<model>.<field>" entityId={id} />`, never the
     raw value. Don't send raw sensitive values to client components either.
   - Use shadcn/ui components from `src/components/ui` and plain `Table`s.
     Add missing components with `npx shadcn@4.23.0 add <name>`; this adds no
     npm dependency. Pages render inside the existing sidebar shell, so don't
     add a top nav. If the app has several views, add an in-app sub-nav like
     `refunds/layout.tsx`.
   - Show pending approvals to approvers, either as a view or as a
     `/<id>/approvals` page.

9. **Seed** in `prisma/seed.ts`: add a `seed<App>()` function and add its
   tables to `reset()` (children before parents). Use synthetic data only:
   `(Test)` names, `fintech.example` emails, `000-` SSNs and `TEST`
   references. Include at least one record in each state the UI shows. Never
   touch `AuditEvent`.

10. **Tests** in `tests/<id>.test.ts` (node:test + tsx). Copy
    `tests/kyc.test.ts`. Put fixture builders in `tests/fixtures.ts` (tests may
    write with `db` directly). Cover at least:
    - For each action, a role without the permission is rejected with
      `ForbiddenError`/403, nothing changes, and an `action.denied` event is
      written.
    - Each action writes an audit event with the expected `before`/`after`.
    - Audit events never contain the sensitive values, and a reveal needs the
      permission and is audited.
    - The approval-gated change is **not** applied when requested. The
      requester can't approve it (`SelfApprovalError`). A role without the
      approver permission can't approve it. A different approver applies it.
      A rejection releases the hold.
    - App rules from the brief, including races on anything that can be
      claimed (two concurrent `runAction` calls produce exactly one success).
    - If you add `<id>.audit.view`, update the `auditScope` test in
      `tests/platform.test.ts`.

11. **Verify:** from `prototype/`, run `npm run lint`, `npm run typecheck` and
    `npm test`. Then `npm run dev` and sign in at `/sign-in` as each relevant
    persona:
    - the actor does the main flow
    - a second approver approves it
    - the requester tries to approve their own request and is blocked
    - a role without access gets a 403 or doesn't see the app in the sidebar
    - you reveal a masked field

    Check `/admin/audit` as `platform.admin` for each event and confirm no
    sensitive value appears. Don't reseed after a browser check someone may
    want to inspect: the seed recreates records with new IDs, which orphans
    their audit history.

12. **PR:** title `feat(<id>): <what it does>`. Include the spec from step 2,
    assumptions, any schema, platform or role changes and why, any new
    dependency and why, the personas and pages you checked, and screenshots
    that show only synthetic data.

## 5. Done checklist

- [ ] App entry in `src/apps.config.ts` with `status: "live"`; all permissions are `<id>.`-prefixed and narrowly granted.
- [ ] All writes go through `defineAction`/`runAction`, and every action audits `before`/`after`.
- [ ] Gated changes apply only in an approval handler, and the reject handler releases holds.
- [ ] Approver roles are in `approvals.decide`, and there are two approver personas.
- [ ] Sensitive fields are registered, rendered with `<Masked>`, and absent from audit snapshots.
- [ ] Pages check permissions on the server; UI uses shadcn and plain tables.
- [ ] Seed and tests use synthetic data only; required tests from step 10 are present.
- [ ] Lint, typecheck and tests pass; browser-checked as each persona, including `/admin/audit`.
- [ ] Every [REVIEW.md](../REVIEW.md) "Must pass" item holds.

## 6. Example: brief → spec

The flag brief from step 1 becomes:

| Item | Value |
|---|---|
| `id` | `flags` (registry entry exists as `planned`) |
| Permissions | `flags.view` (engineer, admin); `flags.update_nonprod`, `flags.request_prod`, `flags.approve_prod` (engineer) |
| Actions | `flags.value.set` (dev/staging, applies directly and writes a `FlagChange`); `flags.prod.request` (creates an approval, sets nothing) |
| Approval | Key `flags.prod.apply`, approver `flags.approve_prod`, 1 approver other than the requester. Approve: set the prod `FlagValue` and write a `FlagChange` with `approvalRequestId`. Reject: nothing to release. |
| Sensitive fields | None |
| Data | Existing `FeatureFlag`, `FlagValue`, `FlagChange`; no migration |
| Personas | `engineer1` requests, `engineer2` approves, `platform.admin` views only |
