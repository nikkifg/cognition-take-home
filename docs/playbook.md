# Playbook: add an internal app

Paths are relative to `prototype/`. Follow [AGENTS.md](../AGENTS.md); reviewers check [REVIEW.md](../REVIEW.md).

## 1. Brief (from the requester)

A few sentences covering four things: what the app does, who uses it, what needs approval (and by whom), and which fields are sensitive. For example:

> Feature-flag panel. Engineers toggle dev/staging directly. Prod changes need approval from a different engineer. Admins can view only.

## 2. Spec (put it in the PR description before coding)

Turn the brief into:
- **id:** used as the route, the permission prefix and the audit `app`.
- **Permissions:** named `<id>.<thing>.<verb>`, plus `<id>.view`.
- **Actions:** one for each state change.
- **Approvals:** for each gated change, the handler key, the approver permission, and what approve and reject each do.
- **Sensitive fields.**
- **New tables.**

Ask the requester only if the brief is unclear about who approves, what an approval applies, or what counts as sensitive. Fill everything else with these defaults and list them as assumptions in the PR:
- Grant each permission to the fewest roles that need it. Admin gets view only.
- Use one rule ("every X needs approval") rather than amount or risk tiers.
- Require a reason for decisions.
- Never hard-delete records.
- Put external services behind an interface with a mock implementation.

## 3. Build

| Step | Where | Copy from |
|---|---|---|
| Tables (if needed) + `npm run db:migrate -- --name <id>_app`. Backfill new required columns, since `dev.db` already has rows. | `prisma/schema.prisma` | refunds migration |
| Registry entry: permissions, `sensitiveFields`, `approvalHandlers` / `rejectionHandlers`, `status: "live"` | `src/apps.config.ts` | `kyc`, `refunds` |
| Domain actions | `src/apps/<id>/actions.ts` | `requestRefund`, `claimCase` |
| Approve and reject handlers | `src/apps/<id>/approval-handlers.ts` | `approveRefund`, `rejectRefund` |
| `"use server"` wrappers | `src/app/<id>/actions.ts` | `src/app/kyc/actions.ts` |
| Pages | `src/app/<id>/` | `src/app/kyc/page.tsx` |
| Synthetic seed data (add the app's tables to `reset()`) | `prisma/seed.ts` | `seedKyc` |
| Tests | `tests/<id>.test.ts` | `tests/kyc.test.ts` |

Rules for the code:
- **Actions:** define with `defineAction` and write only through `ctx.tx`. Throw a `PolicyError` subclass when an action isn't allowed in the current state. Use `updateMany({ where: { id, status } })` and check `count === 1` for anything two users could race on. Call `ctx.audit({ before, after })` with snapshots that leave out sensitive fields.
- **Approvals:** don't apply the change. Set the record to pending and call `requestApproval`. Its `payload` and `summary` go into the audit log, so pass record IDs only, never sensitive values. The approve handler applies the change only if the record is still pending; the reject handler releases the hold. Handler files import platform **types** only, because runtime imports create a cycle through `apps.config.ts`.
- **Approver roles** must also be listed in `approvals.decide` in `src/platform/rbac.ts`. Add two personas with the approver role so one can request and the other can approve. A new role is a platform change: add it to the `Role` enum, `roles.ts` and `personas.ts`, and explain why in the PR.
- **Pages:** put reads inside `<Suspense>` and call `requireUser()` there. Check `can(user, "<id>.view")` and return a 403 message if it fails. Render sensitive fields with `<Masked app field entityId />`. Use shadcn/ui and plain tables inside the existing sidebar shell.
- **Synthetic data only:** `(Test)` names, `fintech.example` emails, `000-` SSNs, `TEST` references.

## 4. Tests

Each action needs these tests:
- A role without the permission gets a 403, nothing changes, and an `action.denied` event is written.
- The audit event has the right `before` and `after`, with no sensitive values.

Each approval needs these tests:
- Requesting the change doesn't apply it.
- The requester can't approve it (`SelfApprovalError`).
- A role without the approver permission is rejected.
- A different approver's approval applies the change.
- A rejection releases the hold.

Also test the brief's own rules, including that two concurrent claims produce one winner.

## 5. Verify and open the PR

1. From `prototype/`, run `npm run lint`, `npm run typecheck` and `npm test`.
2. Run `npm run dev` and sign in as each persona. Check:
   - the main flow works
   - a second person can approve
   - the requester can't approve their own request
   - a role without access is blocked
   - a masked field can be revealed
3. In `/admin/audit`, check that the events appear and contain no sensitive values. Don't reseed afterwards: it orphans audit history.
4. Open the PR titled `feat(<id>): …`. Include the spec, the assumptions, any schema or platform changes and why, the personas you checked, and screenshots with synthetic data only.
