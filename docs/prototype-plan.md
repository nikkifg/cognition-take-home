# Prototype plan: internal tools platform built with Devin (~2 hours)

**Goal:** one thin internal web app showing the Power Apps controls a fintech engineering team cares about most. Three apps (KYC queue, refunds, feature flags) sit on a shared foundation, so new apps are cheap and safe to add.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- SQLite via Prisma (swap to Postgres in prod); seed script with synthetic data only
- Vitest; GitHub Actions CI (lint, typecheck, test) required on every PR
- Node 20 LTS installed on the VM first (not present today)

## Shared foundation
| Power Apps feature | Prototype equivalent |
|---|---|
| Microsoft Entra ID sign-in + security roles | Mock sign-in standing in for Entra ID: pick a seeded user; session carries role. `requireRole()` / `can(user, action)` |
| Field-level security | `<Masked>` field; reveal requires permission and writes an audit event |
| Dataverse auditing | Append-only `AuditEvent` table via `audit()`: records **changes (before/after) and PII reveals**, not every view |
| Power Automate approvals | `lib/approvals.ts`: four-eyes, no self-approval |
| App catalog | `apps.config.ts` drives navigation; `/admin/audit` plain-table log viewer |
| ALM | Git, PRs, CI on every change |

UI uses plain HTML tables, with no generic DataTable component.

## Guardrail tests: in CI before any app is built
Written in the foundation PR against service-layer functions; app PRs must make them pass.
- RBAC: a role without permission is rejected (403) for every app action.
- Approvals: the requester can't approve their own request; four-eyes needs two different approvers.
- Audit: every state change writes an event with actor, before and after; SSN reveal writes an event; the audit table is append-only (no update/delete path).
- KYC: claimed case can't be claimed by someone else; high-risk approval requires a second, different reviewer.
- Refunds: amount over the role's limit requires approval; the same idempotency key yields exactly one processor call.
- Flags: a prod change creates an approval instead of applying; dev/staging changes apply directly.

## The three apps (trimmed scope)
1. **KYC review queue** `/kyc`: claim a case; approve, reject or escalate with a required reason; four-eyes on high-risk cases; masked SSN with audited reveal.
   *Not included:* SLA badges, request-info, sanctions screening.
2. **Refunds dashboard** `/refunds`: refund limits per role; four-eyes over the limit; no self-approval; idempotent mock processor.
   *Not included:* partial refunds, $5,000 tier.
3. **Feature-flag admin panel** `/flags`: per-environment toggles (dev/staging/prod); approval for prod changes.
   *Not included:* percentage rollout, version diffs, read API.

## Timebox
| Time | Step |
|---|---|
| 0:00–0:30 | Scaffold, schema, seed, mock Entra sign-in, RBAC, audit, approvals, nav registry, **guardrail tests + CI** (PR 1) |
| 0:30–1:15 | Three apps (parallel Devin sessions or sequential; decision pending), each a PR that must pass CI |
| 1:15–1:35 | Audit viewer, merge, fix integration issues |
| 1:35–2:00 | README: what it does, how to run, Power Apps mapping, out-of-scope list with production approach |

## Out of scope (listed in README with production approach)
Real Entra ID/OIDC, real Stripe and KYC vendors, deployment and hosting, ID document images, 5-year retention jobs, production hardening, data migration from Dataverse. Synthetic data only.

## Loom angle
Mapping table → click through the apps as different roles → a blocked self-approval and an audited SSN reveal → CI and PRs → "a new app is a ticket to Devin".
