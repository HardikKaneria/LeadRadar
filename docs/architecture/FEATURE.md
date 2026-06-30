# Radar OIP — Feature Overview

## 1. Product Summary

**Radar OIP** is an AI-powered **Opportunity Intelligence Platform** for agencies,
freelancers, and service businesses. It helps them **discover, analyze, prioritize, and
convert** business opportunities, reducing manual lead hunting by 80–90%.

It is **not a CRM**. A CRM answers _"what happened with my leads?"_ Radar answers the only
question that drives revenue: **_"What should I do next that has the highest chance of
generating revenue?"_**

Radar is a **decision engine**: action intelligence comes first, record-keeping second.

## Interface Direction

Radar's interface should feel like a calm, premium, developer-grade operating console.

- **Dark-first, compact, action-focused.** Near-black canvas, charcoal surfaces, soft borders,
  emerald action color, minimal shadows.
- **Not a CRM dashboard.** The homepage is the Daily Action Center, not a wall of vanity metrics.
- **One shell across the product.** Left sidebar, breadcrumb topbar, main content, optional right
  AI/context drawer.
- **AI is visible but not noisy.** Every score, recommendation, and generated draft should expose
  reasoning, confidence, and advanced metadata on demand.
- **Key screens are workflow screens.** Inbox behaves like triage, opportunity pages foreground next
  action, lead pages enforce follow-up discipline, knowledge pages surface insight over chrome.

## 2. Core User Journey

```
Discovery → AI Intelligence → Opportunity → Lead → Deal → Knowledge → Learning
  (raw)       (analyze/score)   (approved)   (outreach) (won/lost) (capture)  (improves scoring)
                                                                                  ↑__________|
```

A signal enters as a raw **discovery** → the **AI** scores and explains it → a human
**approves** it into an **opportunity** → outreach starts a **lead** → it closes as a
**deal** → the outcome becomes **knowledge** → the **Learning Engine** makes the next
similar opportunity score better.

## 3. Feature Map

| Feature | Purpose | Main users | Module | Phase | AI involvement |
|---------|---------|-----------|--------|-------|----------------|
| Company Brain | Define who/what we sell | Owner/Admin | M1 | P2 | Context for all agents |
| Discovery Engine | Get raw signals in | Member | M2 | P2 | None (raw first) |
| Chrome Extension | Human-assisted capture | Member | M2 | P2 | None |
| Discovery Inbox | Triage signals | Member/Manager | M3 | P2 | Shows AI score |
| Opportunity Analyzer | Score discoveries | System | M5 | P3 | Core |
| Company Research | Enrich companies | System | M5/M7 | P4 | Core |
| Action Planner | Next best action | System | M5 | P3 | Core |
| Opportunity Engine | Approved opportunities | Manager | M6 | P4 | Uses analysis |
| Heat Score | Real-time urgency | System | M6 | P9 | Derived |
| Daily Action Center | What to do today | All | M8 | P4 | Surfaces AI output |
| Lead Pipeline | Track outreach | Member/Manager | M9 | P5 | — |
| Follow-Up Intelligence | No lead without action | All | M10 | P5 | Planner-assisted |
| Task Queues | Overdue/today/upcoming | All | M10 | P5 | — |
| AI Sales Assistant | Generate comms | Member | M11 | P6 | Core |
| Outreach History | Persistent comms | Member | M11 | P6 | Stores AI msgs |
| Proposal Generator | AI proposals | Member | M11 | P6 | Core |
| Company & Contact Graph | Canonical records | System | M7 | P4 | Enriched |
| Relationship Graph | Decision makers/referrals | Manager | M7 | P4 | Optional |
| Knowledge Engine | What converts | Owner/Manager | M12 | P7 | Aggregation |
| Learning Engine | Scores improve | System | M12 | P8 | Core |
| Similar Opportunity Finder | Find like past wins | Member | M12 | P9 | Embeddings |
| Opportunity Clustering | Demand themes | System | M12 | P9 | Embeddings |
| Demand Radar | Trending demand | Owner | M12 | P9 | Embeddings |
| Lead Resurrection | Revive old leads | Member | M10/M12 | P9 | Similarity |
| Revenue Forecasting | Predict revenue | Owner | M12 | P9 | Probabilistic |
| Notifications & Digest | Stay on top | All | M13 | P5/P9 | — |
| AI Provider Management | Replaceable AI | Admin | M4 | P3 | Infra |
| Prompt Versioning | Auditable prompts | Admin | M4 | P3 | Infra |
| Job Monitoring | Async visibility | Admin/Member | Jobs | P1 | — |
| Roles & Permissions | Access control | Owner/Admin | RBAC | P1 | — |
| Billing & Usage | Plans/limits | Owner | Billing | P9 | Meters AI cost |
| Audit & Activities | Who did what | Owner/Admin | M13 | P1/P4 | Logs AI calls |
| Data Export & Governance | Data ownership | Owner | Platform | P9 | Redaction |

## 4. Features

### 4.1 Company Brain
**What:** The org's self-definition — services, priority services, target industries, ICP,
target countries, minimum budget, **bad-lead rules**, and default **outreach tone**.
**Why:** Every scoring/matching decision needs to know what "a good opportunity" means for
*this* business. **Who:** Owner/Admin. **How:** Versioned profile; editing creates a new
revision so old analyses stay explainable. **Screens:** `/settings/company-brain`.
**Modules:** M1. **Tables:** `company_profiles`. **AI:** context injected into every agent.
**Phase:** P2. **Future:** AI-suggested ICP from won deals.

### 4.2 Discovery Engine
**What:** The universal front door — extension capture, manual entry, CSV import; sources
include linkedin, upwork, freelancer, website, referral, manual, csv, whatsapp, email,
existing_customer, conference, client_call, partnership, other. **Why:** every signal,
regardless of origin, should be captured and stored **raw first**. **Who:** Member.
**How:** validate → normalize → dedupe → store verbatim → enqueue analysis. **Screens:**
`/capture`, extension. **Modules:** M2. **Tables:** `discoveries`, `discovery_batches`.
**AI:** none at capture. **Phase:** P2. **Future:** inbox sync, webhook intake.

### 4.3 Chrome Extension Capture
**What:** Human-assisted, **visible-only** capture of search results the user is already
viewing. **Why:** get marketplace/LinkedIn signals without scraping bans. **Who:** Member.
**How:** user clicks "Capture Current Results" → content script reads visible nodes →
confirm overlay → send. **No background scraping, auto-scroll, or crawling.** **Screens:**
popup, `/settings/extension`. **Modules:** M2. **Tables:** `discovery_batches`,
`extension_tokens`. **AI:** none. **Phase:** P2. **Future:** in-browser opportunity preview.

### 4.4 Discovery Inbox
**What:** Email-like triage for discoveries (new→…→approved/ignored/converted). **Why:**
fast human review at scale. **Who:** Member/Manager. **How:** filter by source/date/country/
service/score; bulk approve/ignore. **Screens:** `/inbox`. **Modules:** M3. **Tables:**
`discoveries`. **AI:** shows score + reason. **Phase:** P2. **UI direction:** left filter rail,
center list, right preview with AI analysis and approve/ignore/re-analyze actions.
**Future:** saved smart views.

### 4.5 AI Opportunity Analyzer
**What:** Scores a raw discovery 0–100 with intent, service_match, budget_estimate, urgency,
confidence, recommended_action, and a human-readable reason. **Why:** turn noise into a
ranked, explained decision. **Who:** system. **How:** discovery + Company Brain + scoring
strategy → validated JSON; bad-lead rules applied. **Modules:** M5. **Tables:** `ai_analysis`,
`ai_requests`. **AI:** core. **Phase:** P3. **Future:** multi-model ensemble.

### 4.6 Company Research Agent
**What:** Analyzes a company's website, tech, industry, likely problems, and suggested
services. **Why:** richer context → better outreach and scoring. **Who:** system. **How:**
`research-company` job → `companies.enrichment`. **Modules:** M5/M7. **Tables:** `companies`.
**AI:** core. **Phase:** P4. **Future:** live tech-stack detection.

### 4.7 Action Planner
**What:** Produces the next best action, priority (critical/high/medium/low), and timeline.
**Why:** every opportunity should carry a concrete next step. **Who:** system. **How:**
analysis + pipeline state → action + `due_at`; can auto-create the first task. **Modules:**
M5. **Tables:** `opportunities`, `tasks`. **AI:** core. **Phase:** P3. **Future:** playbooks.

### 4.8 Opportunity Engine
**What:** Approved discoveries become opportunities (`AI score > threshold AND human
approval`). Statuses: open, qualified, promoted_to_lead, ignored, expired, archived. **Why:**
human-in-the-loop quality gate. **Who:** Manager. **How:** approve → upsert company/contact →
create opportunity. **Screens:** `/opportunities`. **Modules:** M6. **Tables:**
`opportunities`. **AI:** consumes analysis. **Phase:** P4. **Future:** auto-approve trusted sources.

### 4.9 Opportunity Heat Score
**What:** A real-time signal combining score, urgency, recency, engagement, and expiry.
**Why:** "hot now" beats "high once". **Who:** all (sorting). **How:** scheduled
`recompute-heat`. **Modules:** M6/M12. **Tables:** `opportunities.heat_score`. **AI:** derived.
**Phase:** P9. **Future:** engagement webhooks feed heat live.

### 4.10 Daily Action Center
**What:** The **homepage** — not CRM stats. Three lanes: high-value opportunities today,
follow-ups due/overdue, urgent actions. **Why:** answer "what should I do today?" instantly.
**Who:** all. **How:** read-model aggregating opportunities/tasks/leads. **Screens:** `/`.
**Modules:** M8. **Tables:** aggregates. **AI:** surfaces AI output. **Phase:** P4.
**UI direction:** action cards answer what to do, why now, potential value, and next action before
showing supporting detail. **Future:** personalized daily plan.

### 4.11 Lead Pipeline
**What:** Tracks outreach stages (new→contacted→reply_received→meeting_scheduled→
proposal_sent→negotiation→won/lost/on_hold) **without bloated CRM complexity**. **Who:**
Member/Manager. **How:** promote opportunity → lead. **Screens:** `/pipeline`. **Modules:**
 M9. **Tables:** `leads`. **AI:** —. **Phase:** P5. **UI direction:** lead workspace brings stage,
 next action, tasks, timeline, notes, outreach, proposal state, and AI assistance into one surface.
 **Future:** configurable stages.

### 4.12 Follow-Up Intelligence
**What:** Enforces **no active lead without a next action** (owner + task + due date +
priority). **Why:** leads die from silence, not rejection. **Who:** all. **How:** stage-guard
+ checker job. **Screens:** lead workspace. **Modules:** M10. **Tables:** `tasks`, `leads`.
**AI:** planner-assisted. **Phase:** P5. **Future:** smart due-date suggestions.

### 4.13 Task Queues
**What:** Overdue / today / upcoming / assigned task views. **Who:** all. **How:** queries on
`tasks` by due/owner/status. **Screens:** `/tasks`. **Modules:** M10. **Tables:** `tasks`.
**AI:** —. **Phase:** P5. **Future:** workload balancing.

### 4.14 AI Sales Assistant
**What:** Generates outreach messages, follow-ups, conversation summaries, proposals, meeting
prep, and next actions in context. **Who:** Member. **How:** AI Gateway + entity context.
**Screens:** assistant drawer and dedicated assistant workspace. **Modules:** M11. **Tables:**
`outreach_messages`, `proposals`, `ai_requests`. **AI:** core. **Phase:** P6. **UI direction:**
contextual right-side drawer first, with expandable advanced metadata rather than chat-for-chat's-sake.
**Future:** voice-call prep.

### 4.15 Outreach History
**What:** Persistent record of outbound/inbound communication, threaded into conversations.
**Why:** durable context + engagement signals (sent/opened/replied). **Who:** Member. **How:**
`outreach_messages` + `conversations` (AI summary). **Modules:** M11. **Tables:**
`outreach_messages`, `conversations`, `message_templates`. **AI:** stores AI-generated msgs.
**Phase:** P6. **Future:** Gmail/Outlook sync.

### 4.16 Proposal Generator
**What:** AI-assisted proposal generation and storage with a lifecycle (draft→ready→sent→
accepted/rejected/expired). **Who:** Member. **How:** `generate-proposal` job → `proposals` +
`attachments`. **Screens:** proposal editor/preview. **Modules:** M11. **Tables:**
`proposals`, `attachments`. **AI:** core. **Phase:** P6. **Future:** e-sign.

### 4.17 Company & Contact Graph
**What:** Canonical, deduped company/contact records. **Who:** system/Member. **How:** upsert/
merge across discoveries; enriched by research. **Screens:** `/companies`. **Modules:** M7.
**Tables:** `companies`, `contacts`. **AI:** enriched. **Phase:** P4. **Future:** auto-merge ML.

### 4.18 Relationship Graph
**What:** Typed, weighted edges — decision_maker_for, referred_by, influencer_for,
previous_client, partner, competitor, same_company/domain, works_at, knows. **Why:** sell
through relationships. **Who:** Manager. **How:** `relationship_edges`. **Screens:** company
page graph. **Modules:** M7. **Tables:** `relationship_edges`. **AI:** optional. **Phase:** P4.
**Future:** path-to-decision-maker suggestions.

### 4.19 Knowledge Engine
**What:** Captures wins, losses, reasons, source performance, service performance, conversion
patterns. **Why:** the competitive moat. **Who:** Owner/Manager. **How:** `knowledge_events`
on every outcome with a feature snapshot. **Screens:** `/knowledge`. **Modules:** M12.
**Tables:** `knowledge_events`. **AI:** aggregation. **Phase:** P7. **UI direction:** emphasize
conversion by source/service, win/loss reasons, demand radar, similar opportunity patterns, and
revenue forecast over decorative charts. **Future:** cohort analysis.

### 4.20 Learning Engine
**What:** Scoring that improves from historical outcomes (heuristic → statistical → ML).
**Why:** compounding advantage. **Who:** system. **How:** `recompute-scoring` publishes a new
active `scoring_strategy`. **Modules:** M12. **Tables:** `scoring_strategies`,
`knowledge_events`. **AI:** core. **Phase:** P8. **Future:** per-segment models.

### 4.21 Similar Opportunity Finder
**What:** Finds opportunities similar to past wins. **How:** pgvector k-NN over embeddings.
**Modules:** M12. **Tables:** `discoveries`/`opportunities` embeddings. **AI:** embeddings.
**Phase:** P9. **Future:** "why similar" explanation.

### 4.22 Opportunity Clustering
**What:** Groups demand into themes via embeddings. **Modules:** M12. **AI:** embeddings.
**Phase:** P9. **Future:** auto-named segments with playbooks.

### 4.23 Demand Radar
**What:** Trending services, industries, and sources over time. **Who:** Owner. **Modules:**
M12. **Phase:** P9. **Future:** market alerts.

### 4.24 Lead Resurrection
**What:** Surfaces dormant lost/on_hold leads matching new demand. **Modules:** M10/M12.
**Tables:** `leads`, `knowledge_events`. **AI:** similarity. **Phase:** P9. **Future:**
auto-drafted re-engagement.

### 4.25 Revenue Forecasting
**What:** Forecasts revenue from opportunity score, stage, and value. **How:**
Σ(conversion_prob × value). **Who:** Owner. **Modules:** M12. **Phase:** P9. **Future:**
scenario modeling.

### 4.26 Notifications and Digest
**What:** Urgent actions, overdue follow-ups, proposal ready, AI analysis done, expiring
opportunities, weekly insight, monthly AI usage warning. **How:** `notifications` +
`notification_preferences` + daily digest. **Screens:** `/notifications`. **Modules:** M13.
**Phase:** P5 (core) / P9 (full). **Future:** Slack/WhatsApp channels.

### 4.27 AI Provider Management
**What:** A **legitimate, free-first** provider system the **Master Admin** runs — approved
provider accounts (Gemini, Groq, OpenRouter, Ollama, …), a model router (model-per-task), and a
metered usage ledger. **Why:** AI must be replaceable and provider-independent; start on free
tiers without abusing them. **Who:** Master Admin (platform). **Screens:** `/admin/ai-providers`,
`/admin/ai-routing`, `/admin/ai-usage`. **Modules:** M15. **Tables:** `ai_provider_accounts`,
`ai_task_routes`, `ai_model_catalog`. **Phase:** P3. **AI:** routes every call.
See [14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md).

### 4.28 Prompt Versioning
**What:** Versioned, auditable AI prompts (system defaults + org custom). **Why:** every AI
output must be reproducible. **How:** `ai_prompt_versions`; every `ai_request` references a
version. **Who:** Admin. **Modules:** M4. **Phase:** P3. **Future:** A/B prompt testing.

### 4.29 Job Monitoring
**What:** Tracks async work — AI analysis, CSV import, company research, proposal generation,
scoring/heat recompute, digest, extension batch. **How:** `job_runs` + `/jobs` API. **Who:**
Admin/Member. **Screens:** `/jobs`. **Phase:** P1 (skeleton)→ used throughout.
**UI direction:** compact operational table, visible terminal states, inline progress, and a log drawer
or detail panel for drill-down.

### 4.30 Roles and Permissions
**What:** System roles **master_admin / company_admin / sales_executive** (+ future manager,
viewer, billing_admin, ai_admin, senior_sales_executive) + custom roles with granular permission
keys. **Why:** scalable SaaS access control; the **Sales Executive** is the primary daily user.
**How:** `roles`/`permissions`/`role_permissions`/`platform_admins` + PermissionGuard.
**Screens:** `/settings/roles-permissions`. **Phase:** P1.
See [15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md).

### 4.31 Billing and Usage Limits
**What:** Plans, subscription, AI cost, discovery limits, seat limits, storage. **How:**
`plans`/`subscriptions`/`usage_limits`/`billing_events` + metering. **Who:** Owner. **Screens:**
`/settings/billing`. **Phase:** P9.

### 4.32 Audit Logs and Activities
**What:** Who changed what (audit_log), entity timelines (activities), AI request logs.
**How:** append-only audit + polymorphic activities. **Screens:** `/settings/audit`. **Phase:**
P1/P4.

### 4.33 Data Export and Governance
**What:** Data ownership, deletion, retention, AI prompt redaction, privacy mode. **How:** see
[12-data-lifecycle-and-governance](./12-data-lifecycle-and-governance.md). **Screens:**
`/settings/security`. **Phase:** P9.

### 4.34 AI API Key Pool
**What:** Master-Admin-owned pool of approved provider API keys with per-key task-type allowlists,
quotas, status (active/limited/cooldown/exhausted/failed/revoked), and health. **Why:** use the
platform's approved free/low-cost capacity efficiently and **within provider terms** — not
key-rotation to bypass limits. **Who:** Master Admin. **Screens:** `/admin/api-keys`. **Tables:**
`ai_api_keys`, `ai_provider_accounts`, `ai_provider_rate_limit_events`. **Modules:** M15. **Phase:** P3.

### 4.35 AI Usage Ledger
**What:** Per-call billing/credits ledger (`ai_usage_events`) — distinct from the technical
`ai_requests` log — attributing every call to org + user + key + provider with tokens & cost.
**Why:** answer "which company/user/model/task/provider/key used what" and enforce quotas/credits.
**Who:** Master Admin (global), Company Admin (company), Sales Executive (own + read-only summary).
**Screens:** `/admin/ai-usage`, `/settings/usage`, `/usage/*`. **Modules:** M15, billing. **Phase:** P3.

### 4.36 Sales Executive Lead-Hunting Workflow
**What:** The primary daily loop — search → capture visible opportunities → Discovery Inbox → AI
analysis → review score/reason → shortlist → submit/convert → outreach → lead pipeline → follow-up
→ outcome → Knowledge/Learning. **Why:** the product is built for the opportunity hunter. **Who:**
Sales Executive. **Screens:** extension, `/capture`, `/inbox`, `/`, `/pipeline`, `/tasks`.
**Phase:** P2→P6. See [15 §15.4](./15-roles-permissions-and-admin-system.md).

### 4.37 Master Admin Dashboard
**What:** Platform console — companies, users, plans, AI providers/keys/routing, global usage, AI
cost vs revenue, free-tier/provider health, failed jobs/requests, model performance, system health,
audited support access. **Who:** Master Admin. **Screens:** `/admin/*`. **Modules:** M14. **Phase:** P9.

### 4.38 Company Admin Dashboard
**What:** Total discoveries captured, discoveries/conversion by Sales Executive, approved vs ignored,
usage by user, AI credits used, best source platforms & services, follow-up performance. **Who:**
Company Admin. **Screens:** `/` (org homepage). **Modules:** M8, M14. **Phase:** P4.

### 4.39 Sales Executive Dashboard
**What:** My best opportunities today, my captures waiting for AI, my high-score discoveries, my
follow-ups due/overdue, my outreach drafts, my usage this month. **Who:** Sales Executive.
**Screens:** `/` (org homepage). **Modules:** M8. **Phase:** P4.

## 5. What This Platform Is Not

- **Not a normal CRM** — it recommends actions, it doesn't just record history.
- **Not an email automation / spam tool** — outreach is human-reviewed; no mass auto-send.
- **Not an aggressive scraping system** — capture is human-assisted, visible-only; no
  background scraping, auto-scroll, or crawling.
- **Not a black-box AI scoring tool** — every score ships with a reason and a prompt version.
- **Not a single-provider AI wrapper** — AI is replaceable via a provider abstraction.
- **Not a free-tier abuse system** — the AI key pool uses approved accounts within provider terms;
  no key-rotation to bypass limits, no account farming.

## 6. Feature Priority

| Feature | Phase | Priority | MVP required? | Future enhancement? |
|---------|-------|----------|---------------|---------------------|
| Company Brain | P2 | Must-have | Yes | ICP auto-suggest |
| Discovery Engine | P2 | Must-have | Yes | Webhook/inbox intake |
| Chrome Extension | P2 | Must-have | Yes | In-browser preview |
| Discovery Inbox | P2 | Must-have | Yes | Smart views |
| Opportunity Analyzer | P3 | Must-have | Yes | Ensemble models |
| Action Planner | P3 | Must-have | Yes | Playbooks |
| Prompt Versioning | P3 | Must-have | Yes | A/B testing |
| AI Provider Mgmt | P3 | Must-have | Yes | More providers |
| Opportunity Engine | P4 | Must-have | Yes | Auto-approve |
| Daily Action Center | P4 | Must-have | Yes | Personalized plan |
| Company Research | P4 | Should-have | No | Live tech detect |
| Relationship Graph | P4 | Should-have | No | Path suggestions |
| Lead Pipeline | P5 | Must-have | Yes | Configurable stages |
| Follow-Up Intelligence | P5 | Must-have | Yes | Smart due dates |
| AI Sales Assistant | P6 | Must-have | Yes | Voice prep |
| Outreach History | P6 | Must-have | Yes | Inbox sync |
| Proposal Generator | P6 | Must-have | Yes | E-sign |
| Knowledge Engine | P7 | Must-have | Yes | Cohorts |
| Learning Engine | P8 | Must-have | Yes | Per-segment models |
| Heat & Expiry | P9 | Should-have | No | Live engagement |
| Similar / Clustering | P9 | Should-have | No | Explanations |
| Demand Radar | P9 | Should-have | No | Market alerts |
| Lead Resurrection | P9 | Should-have | No | Auto re-engage |
| Revenue Forecasting | P9 | Should-have | No | Scenarios |
| Billing & Usage | P9 | Should-have | No | Metered add-ons |
| Job Monitoring | P1 | Must-have | Yes | Realtime stream |
| Roles & Permissions | P1 | Must-have | Yes | Field-level perms |
| Notifications & Digest | P5/P9 | Should-have | Partial | Slack/WhatsApp |
| Data Governance | P9 | Should-have | No | Region residency |

## 7. Feature Dependencies

- **Everything** depends on Foundation (auth, org, RBAC, tenant context, jobs) — P1.
- **AI features** (Analyzer, Research, Planner, Assistant, Learning) depend on the **AI
  Gateway + Prompt Versioning** (M4).
- **Opportunity Engine** depends on **AI analysis** + **Discovery Inbox approval**.
- **Daily Action Center** depends on Opportunities + Tasks + Leads.
- **Follow-Up Intelligence** depends on the Lead Pipeline.
- **Sales Assistant / Outreach / Proposals** depend on the Lead Pipeline + AI Gateway.
- **Knowledge Engine** depends on outcomes from the Pipeline + Outreach.
- **Learning Engine** depends on the Knowledge Engine (needs real outcome data).
- **Advanced intelligence** (similar/clustering/radar/resurrection/forecast) depends on
  embeddings (M4) + Knowledge/Learning.
- **Billing/Usage** depends on the metering hooks added in the AI Gateway and Pipeline.

## 8. Future Feature Ideas

- Browser-side opportunity preview (score before capture)
- Gmail/Outlook inbox sync (two-way outreach)
- Calendar meeting intelligence (prep + follow-up automation)
- Website visitor intelligence (inbound signals)
- Slack / WhatsApp alerts (notification channels)
- Team performance coaching (owner-level insights)
- Sales playbook generator (per demand cluster)
- Opportunity marketplace (share/route surplus leads)
- Multi-workspace agency mode (clients as workspaces)
- AI voice call preparation
- Competitive intelligence monitor
