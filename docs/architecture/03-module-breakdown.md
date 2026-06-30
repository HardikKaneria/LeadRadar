# 03 — Module Breakdown

Each module owns its data and exposes a service interface. No module reaches into
another module's tables — it calls the owning module's service. This is what keeps the
monolith extractable.

Legend — **Complexity:** S(mall) / M(edium) / L(arge) / XL.

---

## M1 · Company Brain
**Owns:** `company_profiles`
The org's self-definition that powers every scoring/matching decision.
- Services offered, priority services, target industries, ideal customer profile (ICP),
  target countries, minimum budget, **bad-lead rules** (exclusion filters).
- Versioned: editing the brain creates a new revision so old analyses remain explainable.
- Exposes `getActiveProfile(orgId)` consumed by the AI Intelligence module.
**Depends on:** Org/Auth. **Complexity:** M.

## M2 · Discovery & Ingestion
**Owns:** `discoveries`, `discovery_batches`
The universal front door. **Everything starts as a discovery item**, stored raw first.
- Channels: Extension capture, Manual entry, CSV import. (Website/referral are sources
  within manual/CSV.)
- Validates + normalizes payloads, dedupes via idempotency + fuzzy match, stores raw blob.
- Emits `analyze-discovery` jobs.
**Depends on:** Org/Auth, Object Store, Queue. **Complexity:** L.

## M3 · Discovery Inbox
**Owns:** the read/triage experience over `discoveries` (no own tables).
Email-inbox-style triage surface.
- Statuses: `new → processing → analyzed → reviewed → approved → ignored → converted`.
- Filters: source (full `discovery_source` enum), date, country, service, score. Bulk approve/ignore.
- Approve action calls the Opportunity module to promote.
**Depends on:** M2, M5, M6. **Complexity:** M.

## M4 · AI Gateway
**Owns:** `ai_requests`, `ai_prompt_versions` (the key pool + ledger live in **M15**, see [14](./14-ai-provider-and-usage-system.md))
Provider-agnostic access to LLMs + embeddings. See [09-ai-workflow](./09-ai-workflow.md).
- **Single entry point:** `AIService.generate(taskType, input, organizationId, userId)`,
  `generateStructured(...)`, `embed(...)`. No domain module ever calls a provider SDK directly.
- Adapters: Gemini, Groq, OpenRouter, Ollama (+ generic OpenAI-compatible). **Free-first**, not
  Claude-default.
- Retries, provider fallback, structured-output validation/repair, token & cost tracking,
  rate limiting, **auditable prompt versioning** (`ai_prompt_versions`; every `ai_request`
  references the exact prompt version).
**Depends on:** Org/Auth (per-org keys), Redis. **Complexity:** L.

## M5 · AI Intelligence (Agents)
**Owns:** `ai_analysis`
Orchestrates the agents on top of the gateway.
- **Opportunity Analyzer** → score, intent, service_match, budget_estimate, urgency,
  confidence, recommended_action, reason.
- **Company Research Agent** → website/tech/industry/problems/suggested services.
- **Action Planner** → next best action, priority, recommended timeline.
- Combines AI output with Company Brain + current scoring strategy.
**Depends on:** M1, M4, M12 (scoring), Queue. **Complexity:** XL.

## M6 · Opportunity Engine
**Owns:** `opportunities` (+ upserts `companies`, `contacts` via their modules)
Only **approved** discoveries become opportunities (`AI score > threshold AND human approval`).
- Statuses: `open → qualified → promoted_to_lead`, plus `ignored`, `expired`, `archived`.
- User-facing priority: `critical / high / medium / low` (internal `priority_weight`).
- Surfaces score, priority, potential value, source, AI explanation, recommended action.
- Computes derived signals: **heat score**, **expiry prediction** (advanced features).
**Depends on:** M3, M5, M7. **Complexity:** L.

## M7 · Company & Contact Graph
**Owns:** `companies`, `contacts`, `relationship_edges`
Canonical company/contact records + the **relationship graph**.
- Dedup/merge of companies and contacts across discoveries.
- Enriched by Company Research Agent.
- `relationship_edges` model decision-makers, referrals, partners, previous clients,
  influencers, same-company/domain links (typed, weighted edges).
**Depends on:** Org/Auth. **Complexity:** M.

## M8 · Daily Action Center
**Owns:** the homepage read-model (no own tables; aggregates across modules).
**Not CRM stats.** Answers "what should I do today?".
- Today's high-value opportunities, due/overdue follow-ups, urgent actions.
- Each card: what to do, why (reason), potential value, one-click AI assist.
**Depends on:** M6, M9, M10. **Complexity:** M.

## M9 · Lead Pipeline
**Owns:** `leads`
Post-outreach progression.
- Stages: `new → contacted → reply_received → meeting_scheduled → proposal_sent →
  negotiation → won → lost → on_hold`.
- A lead is created when outreach begins on an opportunity.
**Depends on:** M6, M10. **Complexity:** M.

## M10 · Follow-up Intelligence (Tasks)
**Owns:** `tasks`
Enforces the rule: **no active lead without a next action**.
- Every active lead requires owner + task + due date + priority.
- Overdue/due-today queues, stale detection, reassignment.
- Can auto-create the next task from Action Planner output.
**Depends on:** M9, Org/Auth. **Complexity:** M.

## M11 · AI Sales Assistant
**Owns:** `outreach_messages`, `conversations`, `message_templates`, `proposals`, `attachments`
In-context generation **and** persistent communication history.
- Generate outreach message, generate follow-up, summarize conversation, create proposal,
  prepare meeting questions, suggest next action.
- Persists every outbound/inbound message (`outreach_messages`) threaded into
  `conversations` with an AI-maintained summary; engagement timestamps (sent/opened/replied)
  feed heat score and learning.
- Reusable, tone-controlled `message_templates` keyed by service + stage.
- First-class `proposals` lifecycle (draft → ready → sent → accepted/rejected/expired) with
  storage via `attachments`.
**Depends on:** M4, M6, M9. **Complexity:** M.

## M12 · Knowledge & Learning Engine
**Owns:** `knowledge_events`, `scoring_strategies`, learning artifacts
The competitive moat.
- **Knowledge:** capture wins, losses, reasons, conversion patterns, successful outreach.
- **Learning:** aggregate outcomes → recompute scoring weights / similarity clusters →
  publish a new active scoring strategy. `ScoringStrategy` is an interface (heuristic →
  statistical → ML over time).
- Powers: similar-opportunity finder, clustering, demand radar, lead resurrection,
  revenue forecasting (see advanced features below).
**Depends on:** M9, M5, M4 (embeddings), Queue. **Complexity:** XL.

## M13 · Activity, Notes & Audit
**Owns:** `activities`, `notes`, `audit_log`
Cross-cutting timeline + free-form notes + append-only audit. Every domain mutation can
emit an activity; sensitive changes also hit the audit log.
**Depends on:** all. **Complexity:** S–M.

---

## Advanced features → where they live

| Feature | Home module | Mechanism |
|---------|-------------|-----------|
| Opportunity heat score | M6 | Real-time signal: score × recency × engagement × urgency |
| Opportunity expiry prediction | M6 + M12 | Model over historical time-to-close vs. signal decay |
| Similar opportunity finder | M12 | pgvector nearest-neighbor on embeddings |
| Opportunity clustering | M12 | Embedding clustering (demand themes) |
| Demand radar | M12 + M8 | Trend detection over clusters/sources over time |
| Lead resurrection | M10 + M12 | Surfaces dormant lost/on-hold leads matching new demand |
| Revenue forecasting | M12 | Probability (score→conv. rate) × value × stage, aggregated |
| Relationship graph | M7 | Company/contact edges + interaction history |

---

## Supporting (platform) modules

- **Auth & Org** — users, organizations, memberships, invites.
- **RBAC** — `roles`, `permissions`, `role_permissions`, `platform_admins`. System roles
  `master_admin` (platform), `company_admin`, `sales_executive` (the primary daily user) +
  future `manager / viewer / billing_admin / ai_admin / senior_sales_executive` + per-org custom
  roles; permission keys gate every action (`discoveries.capture`, `discoveries.approve`,
  `ai.use`, `company.billing.manage`, `platform.ai_providers.manage`, …). Powers the Roles &
  Permissions settings page. Full catalog: [15](./15-roles-permissions-and-admin-system.md).
- **Integrations** — `integration_accounts` (ai_provider / email / calendar / storage /
  webhook / extension) + `extension_tokens` (scoped, revocable capture tokens). CSV import
  jobs, webhooks.
- **Notifications** — `notifications` + `notification_preferences`. In-app + email alerts
  (urgent_opportunity, follow_up_due/overdue, opportunity_expiring, ai_analysis_done,
  csv_import_done, proposal_ready, lead_stale, lead_resurrection, weekly_insight,
  monthly_ai_usage_warning); daily digest.
- **Jobs / Job Monitoring** — `job_runs` tracks every async operation (AI analysis, CSV
  import, company research, proposal generation, scoring/heat recompute, digest, extension
  batch processing) with status + progress, surfaced via the Job Status API.
- **Billing & Usage** — `plans`, `subscriptions`, `usage_limits`, `company_usage_limits`,
  `usage_credit_grants`, `billing_events`. Plan limits, metered usage (ai_tokens, ai_cost_usd,
  ai_requests, discovery_items, opportunity_analysis, company_research, proposal_generations,
  extension_batches, seats, storage_mb, active_leads), credits, provider webhooks.
- **M14 · Platform Admin** — the Master Admin area (`/admin/*`): companies, users, plans, global
  usage, jobs, billing/revenue, audit, system health. Platform-scoped, gated by `platform.*`. See
  [15](./15-roles-permissions-and-admin-system.md).
- **M15 · AI Provider & Usage** — the legitimate free-first provider key pool, model router, and
  usage ledger: `ai_provider_accounts`, `ai_api_keys`, `ai_task_routes`, `ai_model_catalog`,
  `ai_usage_events`, `ai_provider_health_checks`, `ai_provider_rate_limit_events`. The **only**
  path to a model is `AIService.generate(taskType, input, organizationId, userId)`. See
  [14](./14-ai-provider-and-usage-system.md).
