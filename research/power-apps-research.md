# Microsoft Power Apps: research brief

For: VP Engineering, Series C fintech (~60 engineers). Pays ~$250K/yr for Power Apps, runs 3 apps on it, plans 10+ more.
Scope: facts only, no build-vs-buy recommendation. Prices are Microsoft list prices (USD), checked 2026-10-28. Enterprise agreements may differ. **Premium list price rises 10% on Jan 1, 2027** ([Microsoft](https://www.microsoft.com/en-us/licensing/news/power-apps-premium-price-update)); both prices are shown below.

---

## 1. What Power Apps does beyond building apps

Power Apps is the front end of the wider **Power Platform**. Most of the value comes from what's around the app builder:

| Capability | What it gives you |
|---|---|
| **Dataverse** (managed database) | Tables, relationships, business rules, file storage. Security is built in: roles, business units, row ownership ([security model](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds)), column-level masking ([docs](https://learn.microsoft.com/en-us/power-platform/admin/field-level-security)) |
| **Audit log** | Logs who created, updated, or deleted a record, plus user access, with retention you configure ([docs](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing)) |
| **Connectors** | Prebuilt connectors to SaaS and databases, plus custom connectors for your own REST APIs ([custom connectors](https://learn.microsoft.com/en-us/connectors/custom-connectors/), [connector list](https://learn.microsoft.com/en-us/connectors/connector-reference/)) |
| **Power Automate** (workflow) | Built-in approvals: "everyone must approve", "first to respond", sequential. Approvers can respond from Outlook or Teams ([docs](https://learn.microsoft.com/en-us/power-automate/get-started-approvals)) |
| **Identity** | Users sign in with Microsoft Entra ID. Business units can map to Entra security groups ([docs](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds)) |
| **Governance** | Managed Environments ([docs](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview)), data loss prevention (DLP) policies that control which connectors can be used together ([docs](https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention)), separate dev/test/prod environments ([docs](https://learn.microsoft.com/en-us/power-platform/admin/environments-overview)) |
| **ALM** (release management) | Deployment pipelines between environments ([docs](https://learn.microsoft.com/en-us/power-platform/alm/pipelines)). Git sync with GitHub or Azure DevOps, dev environments only ([docs](https://learn.microsoft.com/en-us/power-platform/alm/git-integration/overview)) |
| **AI** | Copilot builds apps from plain-language prompts; some features are still in preview ([docs](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/ai-overview)). AI Builder can read IDs and passports, sold as an add-on ([docs](https://learn.microsoft.com/en-us/ai-builder/prebuilt-id-reader)) |
| **Pro-code escape hatches** | "Code apps": React/Vue apps hosted on the platform ([docs](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)). Custom UI components (PCF, [docs](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/overview)). .NET server-side plug-ins ([docs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/plug-ins)) |

**Why this matters for this client:** for a fintech, the value is less "drag-and-drop UI" and more **ready-made controls**: identity, role-based access, audit trails, approvals, environment separation, and admin governance. Auditors and regulators ask for exactly these. Each new internal app gets them without extra work. The trade-off is that the platform shapes how apps are built and priced (see §4–5).

---

## 2–3. The three apps: requirements, and how each would be built on Power Apps

Two types of app exist ([canvas](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/getting-started) = free-form UI; [model-driven](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/model-driven-app-overview) = forms, views, and dashboards generated from Dataverse tables). Queue and admin apps usually start model-driven.

### A. KYC review queue
**Requirements**
- Regulatory basis: a customer identification program with risk-based identity verification ([31 CFR 1020.220](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1020/subpart-B/section-1020.220)). For business customers, beneficial-owner checks ([31 CFR 1010.230](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-B/section-1010.230)). BSA records kept **5 years** ([31 CFR 1010.430](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-D/section-1010.430)).
- Queue with assignment, SLA timers, priority/risk score, and filters at production volume.
- Case view: applicant data, ID documents/selfie, vendor results (IDV, sanctions/PEP screening), notes.
- Decisions (approve, reject, request info, escalate) with required reason codes. Maker-checker (four-eyes) for high-risk cases.
- PII controls: least-privilege roles, masked fields (SSN/TIN), **logging of who viewed what**, retention and deletion rules.
- Integrations: KYC vendor webhooks/API, core user DB, case-status write-back.

**Typical Power Apps build**
- Model-driven app on Dataverse tables (Case, Document, Decision). Views as queues. Security roles plus column security for PII. Auditing on.
- Escalations and second review through Power Automate approvals.
- **Needs custom work or premium features:**
  - A **custom connector** or Azure Function for the KYC vendor. No Onfido, Jumio, Persona, Alloy, Sumsub, or Socure connector appears in [Microsoft's connector list](https://learn.microsoft.com/en-us/connectors/connector-reference/).
  - Dataverse, custom connectors, and premium connectors all need a **standalone Power Apps license per user** ([licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)).
  - A PCF component for a good document/image viewer.
  - Possibly AI Builder ID reader (add-on cost; Latin text only).
  - Read-access logging goes beyond Dataverse auditing, which **does not log retrieve or export operations**. Access logs go to Purview, and for production environments only ([auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing)).

### B. Refunds dashboard
**Requirements**
- View and search transactions, start refunds, see refund status and history.
- Approval thresholds by amount and role (e.g., >$X needs a manager). Self-approval blocked.
- **Idempotent** refund execution against the payment processor or ledger, with reconciliation.
- If refunds relate to consumer EFT disputes, Reg E error-resolution deadlines apply ([12 CFR 1005.11](https://www.ecfr.gov/current/title-12/chapter-X/part-1005/subpart-A/section-1005.11)).
- Audit trail of every request, approval, and execution. Reporting (volume, reasons, aging).
- No raw card data in the tool, to keep it out of PCI scope.

**Typical Power Apps build**
- Canvas or model-driven app. Transaction data read live (connector or [virtual tables](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-virtual-entities) over Postgres/Snowflake/SQL). Refund requests stored in Dataverse.
- Threshold approvals in Power Automate. Charts in-app or via Power BI.
- **Needs custom work or premium features:**
  - Executing refunds. The [Stripe connector](https://learn.microsoft.com/en-us/connectors/stripe/) is **Premium**, as is [PostgreSQL](https://learn.microsoft.com/en-us/connectors/postgresql/). An internal ledger needs a **custom connector**.
  - Idempotency, retries, and double-refund protection usually live in your own API or a plug-in, not in low-code formulas.
  - Large transaction tables hit **delegation limits** (see §5).
  - Exactly-once execution and reconciliation are custom logic.

### C. Feature-flag admin panel
**Requirements**
- List and search flags, toggle per environment/segment/percentage, schedule changes, roll back.
- Change approval for production or risky flags. Every change audited with before/after values.
- Fine-grained permissions (by team, environment, flag). Fast propagation to services.
- Integrations: flag store (homegrown DB/config service or a vendor like LaunchDarkly), Slack notifications, links to CI/CD.

**Typical Power Apps build**
- Canvas app over a custom connector to the flag service, or Dataverse as the flag store (then services must read Dataverse via its [Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)).
- Approvals via Power Automate. Audit via Dataverse auditing.
- **Needs custom work or premium features:**
  - Almost everything is integration. **No LaunchDarkly connector** appears in [Microsoft's connector list](https://learn.microsoft.com/en-us/connectors/connector-reference/), so it needs a custom connector.
  - Services reading flags at runtime would use up the per-user API request budgets (see §5). Most teams keep the flag store outside Power Platform.
  - Engineers are the main users, and they typically expect Git-based review. Git sync works for solutions but not for code apps ([code apps limits](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)).

---

## 3b. How well can these apps be built on Power Apps?

A fit rating based on the requirements above. It describes Power Apps only and is not a comparison with building in-house.

| App | Fit | Works well | Hard or needs pro-code |
|---|---|---|---|
| **KYC review queue** | **Good** | This is the platform's sweet spot. Queues, case forms, roles, field masking, approvals, and change audit are mostly configuration (model-driven app + Dataverse). | KYC vendor integration (custom connector). Document viewer (PCF). Logging who *viewed* PII (Dataverse auditing doesn't log reads). Keeping 5-year records (needs long-term retention or export). |
| **Refunds dashboard** | **Moderate** | Request forms, amount-threshold approvals, status views, charts. | Moving money safely: idempotency, retries, and reconciliation belong in a backend API, not Power Fx. Large transaction tables run into delegation limits. Stripe and Postgres connectors are Premium. |
| **Feature-flag admin panel** | **Weak** | A simple CRUD screen with approvals and audit. | It's mostly a thin UI over an engineering API. Services can't read flags from Dataverse at runtime because of API limits (§5). There's no LaunchDarkly connector. Engineers expect Git-based review. Dedicated flag vendors already include approval workflows ([LaunchDarkly approvals](https://launchdarkly.com/docs/home/releases/approvals)). |

**Overall pattern:** Power Apps is strongest for **human workflow over business data**: queues, forms, approvals, audit. It is weakest when an app is mainly an **interface to engineering systems** or **moves money**. Then the core logic ends up in custom code anyway, and Power Apps is just the UI layer. Expect most of the 10+ future apps to fall somewhere between these two ends.

---

## 4. Pricing

| Item | List price | Source |
|---|---|---|
| Power Apps **Premium** (unlimited apps) | **$20/user/mo** → **$22 from Jan 1, 2027**; $12 → $14 with 2,000+ seats | [Pricing page](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing), [FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq), [2027 update](https://www.microsoft.com/en-us/licensing/news/power-apps-premium-price-update) |
| Power Apps **per app** (one app per license) | **$5/user/app/mo** | [FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq) (not shown on current public pricing page) |
| Power Apps **pay-as-you-go** | **$10/active user/app/mo** (Azure billed) | [Meters](https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-meters) |
| Power Automate Premium / Process license | $15/user/mo; $150/bot/mo | [Pricing page](https://www.microsoft.com/en-us/power-platform/products/power-automate/pricing) |
| Extra Dataverse capacity | DB $40/GB/mo; file $2/GB/mo; log $10/GB/mo | [FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq) |
| Included capacity per license | Premium +250 MB DB, +2 GB file; per app +50 MB DB, +400 MB file | [FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq) |

**What $250K/yr implies** ($20,833/mo):
- **All Premium at list price:** about **1,040 users** at $20, or about **950 users** at the 2027 price of $22.
- **All per-app, every user on all 3 apps:** about **1,390 users** ($15/user/mo). Per-app pricing is not changing in 2027.
- Both numbers are probably larger than the headcount of a ~60-engineer Series C company. That headcount is our assumption; the client should confirm it. So the $250K likely also covers Power Automate seats, process licenses, extra Dataverse capacity, AI Builder, Power BI, or partner/consulting fees.
- Illustrative mix: 300 Premium users ($72K; $79K at 2027 prices) + 100 Power Automate Premium ($18K) + 5 process licenses ($9K) + 50 GB extra DB ($24K) ≈ **$123K** (**$130K** in 2027), leaving about half for other items.
- **2027 increase:** only Premium ($20 → $22, and $12 → $14) goes up; all other Power Apps and Power Platform prices stay the same. Existing subscriptions keep the current price until the end of their term. The new price applies to new purchases and to renewals starting on or after Jan 1, 2027 ([Microsoft](https://www.microsoft.com/en-us/licensing/news/power-apps-premium-price-update)). The real impact depends on the client's renewal date.
- **Ask for the invoice line items.** The license mix decides what replacing (or growing) the platform actually costs.
- At 10+ more apps, per-app licensing stops making sense. Premium becomes the default, so cost grows with **number of users**, not apps.

---

## 5. Known limitations of Power Apps

**Data and performance**
- **Delegation:** if a query can't be pushed down to the data source, Power Apps only processes the first **500 rows** locally (max 10,000). On large tables, e.g., transactions or KYC cases, that can quietly return incomplete results ([docs](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview)).
- **API request limits:** **40,000** Power Platform requests per user per 24h (Premium), and **6,000** for per-app/pay-as-you-go users. These limits also apply to service accounts ([docs](https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations)).
- **Dataverse throttling:** max 6,000 requests per user per 5 minutes ([docs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits)). This rules out using Dataverse as a high-traffic backend for services, e.g., runtime flag lookups.
- **Custom connectors:** 50 per user (per-user plan); 10,000 requests/min per connection; OpenAPI file must be under 1 MB ([docs](https://learn.microsoft.com/en-us/connectors/custom-connectors/faq)).
- **Workflow:** a single flow run can last at most **30 days** ([docs](https://learn.microsoft.com/en-us/power-automate/limits-and-config)).

**Engineering practice**
- **Logic in low-code:** complex rules, idempotency, and testing are harder in Power Fx than in normal code. Test Studio only covers canvas apps ([docs](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/test-studio)). Server-side plug-ins need .NET Framework skills ([docs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/plug-ins)).
- **Source control:** Git integration only works in dev environments and doesn't support code apps ([Git](https://learn.microsoft.com/en-us/power-platform/alm/git-integration/overview), [code apps](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)).
- **Vendor lock-in:** Dataverse schemas, Power Fx, and flows don't move to other platforms. Leaving means a rebuild.

**Security and compliance**
- **Read auditing gap:** Dataverse auditing doesn't log record reads or exports (§2A).
- **Backups:** kept 7 days by default, up to 28 days for managed production environments ([docs](https://learn.microsoft.com/en-us/power-platform/admin/backup-restore-environments)). Long-term records need [long-term retention](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-retention-overview) (requires Managed Environments) or export.
- **Identity:** Power Platform runs inside a Microsoft Entra tenant ([docs](https://learn.microsoft.com/en-us/power-platform/admin/security/data-storage)). A company standardized on Okta or Google Workspace would need to maintain Entra identities for app users.

**Platform churn**
- Microsoft regularly retires or moves tooling:
  - The CoE Starter Kit governance toolkit is **no longer maintained**; its features moved into the admin center ([docs](https://learn.microsoft.com/en-us/power-platform/guidance/coe/starter-kit)).
  - **New customers can no longer buy AI Builder credits** and must buy Copilot Credits instead ([docs](https://learn.microsoft.com/en-us/ai-builder/credit-management)).
  - Unmanaged dev environments are being deprecated (§6).

---

## 6. Compliance and other details

- **Attestations:** Microsoft lists **Power Apps and Power Automate** as in scope for its **PCI DSS** assessment ([docs](https://learn.microsoft.com/en-us/compliance/regulatory/offering-pci-dss)) and **SOC 2 Type 2** report ([docs](https://learn.microsoft.com/en-us/compliance/regulatory/offering-soc-2)). Under the shared-responsibility model, the client's own controls (roles, DLP, reviews) are still on them.
- **Data protection:** data stays in the chosen geography, TLS 1.2+ in transit, encrypted at rest (TDE) ([docs](https://learn.microsoft.com/en-us/power-platform/admin/wp-compliance-data-privacy)).
- **Security features that need Managed Environments:**
  - Customer-managed encryption keys ([docs](https://learn.microsoft.com/en-us/power-platform/admin/customer-managed-key)).
  - IP firewall, which also needs M365/O365 E5-class licensing ([docs](https://learn.microsoft.com/en-us/power-platform/admin/ip-firewall)).
  - Deployment pipelines ([docs](https://learn.microsoft.com/en-us/power-platform/alm/pipelines)).
  - Managed Environments are included with standalone Power Apps licenses ([docs](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview)).
- **Platform churn:** Microsoft changes the platform often. Unmanaged developer environments are deprecated: existing ones must enable Managed Environments by **Dec 15, 2026** ([docs](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview)). Pipelines will start blocking deployments to unmanaged targets ([docs](https://learn.microsoft.com/en-us/power-platform/alm/pipelines)). Budget for ongoing admin work.
- **Default environment** has no backup guarantees and shouldn't host production apps ([docs](https://learn.microsoft.com/en-us/power-platform/admin/environments-overview)).

---

## 7. Does it scale to 13+ apps? Maintenance and cost

### Maintenance
**What helps at scale**
- New apps reuse the same Dataverse tables, security roles, connectors, and Entra groups. For example, a "Customer" table built for KYC can serve later apps.
- Managed Environments add admin tooling built for many apps:
  - Limits on who apps can be shared with ([docs](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-sharing-limits)).
  - A weekly usage digest that flags inactive apps ([docs](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-usage-insights)).
  - Environment groups that apply rules across many environments ([docs](https://learn.microsoft.com/en-us/power-platform/admin/environment-groups)).
  - Deployment pipelines (§1) and solution checker static analysis ([docs](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/use-powerapps-checker)).

**What grows with each app**
- Each app needs its own dev/test/prod environment path. Microsoft's guidance adds pipelines between them ([environment strategy](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/environment-strategy)).
- Every custom connector and plug-in is code the team owns and must keep in sync with the internal APIs behind it.
- Platform changes (§5–6) land on every app at once and need admin time.
- Skills are split three ways: Power Fx makers, .NET/PCF developers for the escape hatches, and the backend engineers who own the APIs. Apps of the "weak fit" type (§3b) end up maintained in two places: Power Apps and the backend.
- None of this staff time appears in the $250K license cost.

### Cost
- **Premium is priced per user, not per app** ("unlimited custom applications", [FAQ](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq)). Adding 10 apps for people who are already licensed adds **no license cost**. New groups of users (e.g., support, finance) add $240/user/yr, or $264 from 2027.
- **Per-app licensing doesn't scale:** at $5/app/user, anyone using 5+ apps costs more than Premium at the 2027 price ($22/user). Today 4 apps already costs the same as Premium ($20).
- **Costs that do grow with app count:**
  - Dataverse storage beyond the pooled allowance: $40/GB/mo for the database.
  - Power Automate Premium or process licenses ($150/flow/mo) for heavy automations.
  - Copilot Credits for AI features.
  - Custom connector and integration work.

### Is $250K enough?
Without the invoice breakdown this can't be answered precisely. A list-price model:

> Annual cost ≈ (Premium users × $264 at 2027 prices; $240 today) + (Power Automate Premium users × $180) + (process licenses × $1,800) + (extra DB GB × $480) + partner/other

| Scenario (13+ apps) | Today ($20) | 2027 ($22) | Fits in $250K (2027)? |
|---|---|---|---|
| 400 Premium users, 100 PA Premium, 10 process licenses, 50 GB extra DB | ~$156K | ~$166K | Yes, ~$84K headroom |
| 800 Premium users, same add-ons | ~$252K | ~$271K | No |
| 1,000 Premium users, same add-ons | ~$300K | ~$324K | No |

**What decides it:** at list price, $250K holds as long as licensed users stay below roughly **~720** at 2027 prices (~790 at today's price), with ~$60K of add-ons, and heavy automation stays modest. If today's $250K already covers ~1,000 users, as §4 suggests, growth will push spend past $250K. The number of apps itself matters less than how many users and automations they add. Enterprise discounts would change these numbers.

---

## Open questions for the client
1. Line items of the $250K (seats by SKU, capacity, partner fees). How many users, and how many are ops staff vs. engineers?
2. Identity provider (Entra vs. Okta), and whether Microsoft 365 E5 is already licensed.
3. Where KYC/transaction/flag data lives today (Dataverse vs. their own DBs), and the volumes.
4. Who builds the apps today: engineers, ops analysts, or a partner?
5. Audit findings or regulator/partner-bank requirements the current setup was chosen to meet.
6. Who will use the 10+ planned apps (same users, or new teams?), and do any of them move money or call engineering systems?
