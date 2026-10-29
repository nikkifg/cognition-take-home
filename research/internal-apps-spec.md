# The three internal apps: functionality and engineering stack

Companion to `power-apps-research.md`. It describes what each app needs, independent of the platform it's built on. **No build-vs-buy recommendation.** The stacks below are *reference* stacks, meaning the components any implementation needs. Example technologies are illustrative.

---

## 0. Shared foundation (all 3 apps, and the 10+ future ones)

Most of the effort and risk is here, not in individual screens. Build it once and every app reuses it.

| Layer | What it must do | Example tech |
|---|---|---|
| **Identity / SSO** | Staff sign in through the company IdP. No local passwords. MFA enforced by the IdP | OIDC ([spec](https://openid.net/specs/openid-connect-core-1_0.html)) with Okta or Entra ID |
| **Authorization** | Roles (analyst, approver, admin), per-app permissions, and data scoping by team or region | RBAC in the app layer, plus database row-level security ([Postgres RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)) |
| **Audit log** | Append-only record of who did what, when, and before/after values. Includes **reads of sensitive data**. Kept 5+ years for BSA records ([31 CFR 1010.430](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-D/section-1010.430)) | Audit table or event stream; write-once storage for archives |
| **Approvals engine** | Maker-checker (four-eyes), thresholds, escalation, no self-approval | Shared service or library used by every app |
| **Database** | Relational, transactional, with backups and point-in-time restore | Managed Postgres |
| **Background jobs** | Retries, webhooks, scheduled tasks, safe for duplicate delivery | Job queue (e.g., Postgres-backed queue, SQS) |
| **Frontend kit** | Shared table, filter, form, and detail-view components so new apps look and behave the same | React + a component library |
| **Delivery** | Git, code review, CI tests, preview environments, dev/stage/prod | GitHub + CI + container hosting |
| **Observability** | Logs, metrics, alerts, error tracking. No PII in logs | Datadog or Grafana, plus Sentry |
| **Secrets** | Vendor API keys stored and rotated outside the code | Cloud secrets manager |

---

## 1. KYC review queue

**What it is:** where compliance analysts manually review customers whose automated identity checks didn't clear. The app exists to meet customer-identification rules ([31 CFR 1020.220](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1020/subpart-B/section-1020.220)) and, for business customers, beneficial-ownership rules ([31 CFR 1010.230](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-B/section-1010.230)).

**Users:** KYC analysts, senior reviewers/MLRO, compliance leadership (reporting), auditors (read-only).

**Workflow:** vendor flags a customer → case created → analyst claims it → reviews evidence → decides → (high risk) second reviewer signs off → decision written back to the product → kept for audit.

**Important functionality**
- **Queue:** prioritize by risk and SLA age. Claim/assign so no two analysts take the same case. Filters, bulk reassign, SLA breach alerts.
- **Case view:** customer profile, ID document and selfie images, vendor results (document check, liveness, watchlist hits against e.g. the [OFAC SDN list](https://sanctionslist.ofac.treas.gov/Home/SdnList)), prior cases, internal notes.
- **Decisions:** approve, reject, request more info (triggers a customer email), escalate. Mandatory reason codes. Four-eyes rule for high-risk cases or sanctions hits.
- **PII protection:** SSN/TIN masked by default, with reveal-on-click that gets logged. Download restrictions. Scoping by region if needed.
- **Audit and reporting:** full case history, case export for regulators, and metrics (volume, turnaround, approval rate, analyst throughput).
- **Retention:** keep records at least 5 years ([31 CFR 1010.430](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-D/section-1010.430)), then delete on schedule.

**Data model (core):** Customer, Case, Evidence (document, vendor result), Decision, Note, Assignment, AuditEvent.

**Integrations:** KYC/IDV vendor API and webhooks (inbound results, document fetch), core product DB or API (status write-back), email/notifications, data warehouse for reporting.

**Reference stack**
| Component | Need |
|---|---|
| Frontend | Queue table + case detail page with an image/PDF viewer |
| Backend API | Case lifecycle state machine; decision endpoints enforcing four-eyes rules |
| Database | Postgres. Row-locking claims (`SELECT … FOR UPDATE SKIP LOCKED`, [docs](https://www.postgresql.org/docs/current/sql-select.html)) to stop double assignment |
| Document storage | Encrypted object storage, short-lived signed URLs, never public |
| Jobs | Vendor webhook intake (verified, idempotent), SLA timers, retention purge |
| Audit | Log every view of PII as well as every change |

**Hard parts:** read-access logging, safe document handling, a correct state machine (no case lost or decided twice), and the vendor integration.

---

## 2. Refunds dashboard

**What it is:** where support/ops staff find a customer's transaction, request a refund, get approval if needed, and track it until it's done. If refunds come from consumer EFT error claims, Reg E deadlines apply ([12 CFR 1005.11](https://www.ecfr.gov/current/title-12/chapter-X/part-1005/subpart-A/section-1005.11)).

**Users:** support agents (request), team leads/finance (approve), finance ops (reconcile), auditors.

**Workflow:** search transaction → request refund (full or partial, with a reason) → auto-approve under threshold, or route to an approver → execute against processor/ledger → confirm via webhook → reconcile.

**Important functionality**
- **Search:** by customer, transaction ID, amount, or date over large transaction volumes, with server-side pagination.
- **Refund request:** full or partial. Validate that the amount is ≤ the remaining refundable amount. Mandatory reason codes.
- **Approval rules:** thresholds by amount and role, no self-approval, dual approval above a high limit, daily limits per agent.
- **Safe execution:** **idempotency keys** so a retry never refunds twice. Stripe supports these to "safely retry requests without accidentally performing the same operation twice" ([Stripe](https://docs.stripe.com/api/idempotent_requests)).
- **Status tracking:** handle states such as pending or failed (e.g., Stripe holds card refunds as pending when the balance is too low, [docs](https://docs.stripe.com/refunds)).
- **Webhooks:** signed and verified ([Stripe webhooks](https://docs.stripe.com/webhooks)).
- **Reconciliation:** match the internal refund records to processor and ledger records daily, and flag mismatches.
- **Reporting:** refund volume and value, reasons, approval times, outliers by agent (fraud signal).
- **PCI scope:** never show or store full card numbers. Use processor tokens only ([PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/)).

**Data model (core):** Transaction (read from source), RefundRequest, Approval, RefundExecution (processor ID, idempotency key, status), ReconciliationResult, AuditEvent.

**Integrations:** payment processor API (e.g., Stripe [Refunds API](https://docs.stripe.com/api/refunds)), internal ledger, transaction data source (replica or warehouse), notifications.

**Reference stack**
| Component | Need |
|---|---|
| Frontend | Search + transaction detail + request form + approver inbox + charts |
| Backend API | Refund state machine; approval rules engine; **the only component allowed to call the processor** |
| Database | Postgres for requests/approvals; read replica or warehouse for transaction search |
| Jobs | Execution worker with retries + idempotency; webhook handler; nightly reconciliation |
| Security | Scoped processor API key in the secrets manager; per-agent limits; anomaly alerts |

**Hard parts:** exactly-once money movement, reconciliation, and transaction search at scale. This is the riskiest of the three apps because errors cost real money.

---

## 3. Feature-flag admin panel

**What it is:** the UI where engineers and product staff turn features on or off, target segments, and roll out by percentage, without a deploy ([background](https://martinfowler.com/articles/feature-toggles.html)).

**Users:** engineers, product managers, support (read-only "is X on for customer Y?"), on-call (kill switches).

**Workflow:** create flag → set rules per environment → (prod / risky) request approval → apply → services pick up the change within seconds → monitor → clean up old flags.

**Important functionality**
- **Flag CRUD:** key, description, owner, type (boolean or multivariate), tags, expiry date.
- **Targeting:** per environment (dev/stage/prod), user/account segments, percentage rollouts, schedules.
- **Safety:** approval for prod changes, kill switch, one-click rollback to the previous version, diff view before saving.
- **Audit:** every change logged with who, when, and before/after values. Change notifications to Slack.
- **Evaluation path:** services read flags through a fast, cached SDK or API, **not** through the admin UI. The OpenFeature open standard provides a vendor-neutral SDK interface ([OpenFeature](https://openfeature.dev/docs/reference/intro)).
- **Hygiene:** stale-flag reports and an owner for every flag.

**Data model (core):** Flag, Environment, Rule/Segment, FlagVersion (immutable history), ChangeRequest, AuditEvent.

**Integrations:** flag store/evaluation service (homegrown or vendor), service SDKs, Slack, CI/CD (flag references in code).

**Reference stack**
| Component | Need |
|---|---|
| Frontend | Flag list + rule editor + diff/approval view |
| Backend API | Versioned flag config; approval workflow; publishes changes |
| Evaluation | Low-latency read path (cache/CDN/SDK with local evaluation), separate from the admin app, high availability |
| Database | Postgres for config + full version history |
| Integrations | Slack webhooks; optional OpenFeature provider |

**Hard parts:** the runtime evaluation path, which must be fast and highly available. The admin UI is the easy part. Prod changes need approval and audit. Alternatively, a vendor product (e.g., [LaunchDarkly approvals](https://launchdarkly.com/docs/home/releases/approvals)) can replace both.

---

## 4. Side-by-side

| | KYC queue | Refunds dashboard | Feature-flag panel |
|---|---|---|---|
| Primary users | Compliance analysts | Support / finance | Engineers / PMs |
| Risk if wrong | Regulatory | Financial loss | Production outage |
| Sensitive data | High (PII, ID images) | Medium (payments) | Low |
| Approvals | Four-eyes on high risk | Amount thresholds | Prod changes |
| Hardest piece | PII access logging + vendor integration | Exactly-once execution + reconciliation | Runtime evaluation path |
| Data volume | Moderate | High | Low |
| Reuses shared foundation | SSO, RBAC, audit, approvals | SSO, RBAC, audit, approvals, jobs | SSO, RBAC, audit, approvals |

**Takeaway:** all three need the same foundation (SSO, roles, audit, approvals, jobs). The 10+ future apps will likely need it too. Beyond that, each app has one hard, domain-specific core that decides most of the effort and risk.
