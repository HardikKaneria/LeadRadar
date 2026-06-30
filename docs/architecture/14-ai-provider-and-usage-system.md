# 14 — AI Provider & Usage System

> How Radar OIP runs AI **legitimately and cheaply** at SaaS scale. This file defines the
> provider abstraction, the platform-owned **key pool**, the **model router**, the **usage
> ledger**, **quotas/credits**, and **privacy mode**. It complements
> [09 · AI Workflow](./09-ai-workflow.md) (agents + prompts) and
> [15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md)
> (who can see/manage what).

---

## 14.1 Principles

1. **The domain never calls a provider directly.** Every AI call goes through one entry point:
   `AIService.generate(taskType, input, organizationId, userId)`. Nothing in discovery,
   opportunity, lead, or outreach code imports a Gemini/Groq/OpenAI SDK.
2. **AI is replaceable.** Providers, models, and prompts are **data** (tables + config), not
   code. Swapping a provider is a routing change, not a deploy.
3. **Free-first, not free-abuse.** We start on free/low-cost tiers (Gemini, Groq), but through a
   **legitimate key pool** the Master Admin populates with *approved provider accounts*. We do
   **not** rotate keys to dodge a provider's free-tier or rate limits, auto-create accounts, or
   do anything against provider terms. See §14.9.
4. **Every call is accountable.** Each call is logged (`ai_requests`), metered into a billing
   ledger (`ai_usage_events`), counted against company + user quotas, and auditable.
5. **Privacy by default.** Because free APIs may have different data-use terms, v1 defaults to
   `redact_pii_before_ai` (§14.8).

---

## 14.2 The single entry point

```ts
// packages/ai — the ONLY way the domain reaches a model.
AIService.generate(taskType, input, organizationId, userId): Promise<Result>
//          generateStructured(...) → schema-validated JSON
//          embed(...)              → vector
```

`taskType` is one of the **AI task types** (mirrors `ai_task_routes.task_type`):
`opportunity_analyzer`, `action_planner`, `company_research`, `sales_message`,
`follow_up_message`, `conversation_summary`, `proposal_generator`, `meeting_prep`,
`next_action`, `embedding`, `learning_summary`.

The gateway resolves: **active prompt version** (`ai_prompt_versions`) → **route**
(`ai_task_routes`) → **key** (`ai_api_keys` from an `ai_provider_account`) → provider call →
validate → log → meter → fallback.

```
domain module → AIService.generate(taskType,…)
   → resolve prompt version (09)
   → Router (§14.5) picks provider+model+key
   → Provider Adapter (Gemini/Groq/OpenRouter/Ollama/…)
   → validate structured output (repair once, else error)
   → write ai_requests (technical log) + ai_usage_events (billing ledger)
   → update company_usage_limits / usage_limits counters
   → on failure: fallback model → fallback_2 → graceful error
```

---

## 14.3 Two logs, two jobs — do not conflate

| Table | Purpose | Granularity |
|-------|---------|-------------|
| **`ai_requests`** | **Technical** log of every model call — provider, model, tokens, latency, status, error, prompt version, job link. For debugging, audit, model performance. | one row per attempt (incl. fallbacks) |
| **`ai_usage_events`** | **Billing/credits** ledger — the metered, cost-attributed record per successful (or billable) call, keyed to org + user + api key + provider account. Drives quotas, credits, invoices, dashboards. | one row per usage event |

`ai_usage_events.ai_request_id` links back to the technical log. Reporting (“which company/user
used most AI”, “which model is expensive”, “which key is exhausted”) reads `ai_usage_events`;
incident analysis (“why did this call fail”) reads `ai_requests`.

---

## 14.4 Tables (mirror [04 · Database Schema](./04-database-schema.md) §4.8b)

> All AI-infra tables are **platform-scoped** (managed by Master Admin) **except**
> `ai_prompt_versions` (system + org custom), `ai_usage_events`, and `company_usage_limits`
> (tenant-attributed). Provider accounts and keys are **never** tenant-owned and **never**
> exposed to Company Admin or Sales Executive.

### ai_provider_accounts  *(platform)*
An approved provider account the platform bills against.
`id · provider · account_name · account_type · billing_owner · status · monthly_budget ·
monthly_usage · rate_limit_rpm · rate_limit_tpm · notes · created_at · updated_at`
- `provider`: `gemini`, `groq`, `openrouter`, `ollama`, `openai`, `anthropic`, `other`.
- `account_type`: `free_tier`, `paid`, `byok`, `self_hosted`.
- *Why:* one row per legitimate account so spend, rate limits, and budgets are tracked per account.

### ai_api_keys  *(platform)*
A key belonging to a provider account. **Encrypted at rest; never returned in any response.**
`id · provider_account_id · provider · key_name · encrypted_api_key · status · environment ·
allowed_task_types text[] · daily_request_limit · monthly_token_limit · monthly_cost_limit ·
requests_used_today · tokens_used_month · cost_used_month · last_used_at · last_error ·
cooldown_until · created_by · created_at · updated_at · revoked_at`
- `status`: `active`, `limited`, `cooldown`, `exhausted`, `failed`, `revoked`.
- *Why:* the key pool. The router picks an **eligible** key by task type, health, and quota —
  not to bypass limits, but to use the platform’s approved capacity efficiently and stay
  **within** each provider’s terms.

### ai_task_routes  *(platform)*
Master Admin decides which model serves which AI process.
`id · task_type · primary_provider · primary_model · fallback_provider · fallback_model ·
fallback_2_provider · fallback_2_model · requires_json_schema · requires_embedding ·
max_input_tokens · max_output_tokens · temperature · is_active · created_at · updated_at`
- *Why:* routing is configuration. Changing the model for `opportunity_analyzer` is a row edit.

### ai_model_catalog  *(platform)*
Known models and their capabilities/costs.
`id · provider · model · display_name · context_window · max_output · supports_json ·
supports_embedding · embedding_dims · input_cost_per_mtok · output_cost_per_mtok · is_free_tier ·
is_active · created_at · updated_at`
- *Why:* cost estimation, capability checks (JSON/embedding), and admin model pickers.

### ai_usage_events  *(tenant-attributed, billing ledger)*
`id · organization_id · user_id · provider · model · task_type · ai_request_id · api_key_id ·
provider_account_id · input_tokens · output_tokens · total_tokens · estimated_cost ·
is_free_tier · status · created_at`
- Indexes: (organization_id, created_at), (organization_id, user_id, created_at),
  (api_key_id, created_at), (provider, model, created_at), (task_type, created_at).
- *Why:* every reporting question in §14.7 answers from this table.

### ai_provider_health_checks  *(platform)*
`id · provider · provider_account_id · api_key_id · status enum(ok,degraded,down) ·
latency_ms · checked_at · detail jsonb`
- *Why:* the router prefers healthy providers; admins see provider uptime.

### ai_provider_rate_limit_events  *(platform)*
`id · provider · provider_account_id · api_key_id · task_type · limit_type enum(rpm,tpm,daily,monthly) ·
occurred_at · retry_after_seconds · detail jsonb`
- *Why:* observe real rate-limit hits, drive cooldowns, and inform routing — the legitimate way
  to respect a provider’s limits rather than evade them.

### ai_prompt_versions  *(system + org custom)*
See [09 · AI Workflow](./09-ai-workflow.md) §9.1 and [04](./04-database-schema.md). Every
`ai_request` references `ai_prompt_version_id`; every `ai_analysis` stores the version used.

### company_usage_limits  *(tenant)*  /  usage_credit_grants  *(tenant)*
See §14.6.

---

## 14.5 Router decision flow

`AIService.generate(taskType, input, organizationId, userId)`:

1. Resolve **task type** and the active **prompt version**.
2. Check **company plan/limit** (`company_usage_limits`, `subscriptions`) — blocked → graceful 429.
3. Check **user limit** (per-user monthly cap) — blocked → graceful 429.
4. Apply **privacy mode** (§14.8) — redact PII / disallow free APIs / require BYOK as configured.
5. Resolve the **route** (`ai_task_routes`): primary → fallback → fallback_2.
6. Pick an **available key** (`ai_api_keys` where `status=active`, task type allowed,
   `cooldown_until` passed, provider healthy).
7. Check the **key’s quota** (daily/monthly token & cost) — ineligible → next key/provider.
8. **Call** the provider adapter.
9. **Validate** structured output against the schema (one repair pass, else mark error).
10. Write **`ai_requests`** (technical log).
11. Create **`ai_usage_events`** (billing ledger).
12. Update **usage counters** (`company_usage_limits`, `usage_limits`, key counters).
13. On failure (error / rate limit / down): **fallback** to the next model/provider; record a
    `ai_provider_rate_limit_events` / health signal; set the key to `cooldown`/`limited` as
    appropriate.
14. If **all** routes fail: return a **graceful, typed error** (never a stack trace; degrade by
    queueing where the task allows).

**Decision order (summary):** task type → company plan/limit → company privacy setting →
provider health → key availability → rate limit → cost limit → fallback model.

> The router optimizes for **using approved capacity within terms**, then cost, then latency. It
> never creates accounts, never spreads load to defeat a free-tier cap, and never retries in a
> way that violates a provider’s rate limit (it backs off and falls back).

---

## 14.6 Quotas, limits & credits

### company_usage_limits  *(tenant)*
`id · organization_id · period · ai_requests_limit · ai_tokens_limit · ai_cost_limit ·
opportunity_analysis_limit · proposal_generation_limit · company_research_limit ·
embedding_limit · used_requests · used_tokens · used_cost · reset_at · created_at · updated_at`

### usage_credit_grants  *(tenant)*
`id · organization_id · granted_by · metric · amount · reason · expires_at · created_at`
- *Why:* Master Admin (or automated promos) can grant credits; enforcement adds grants on top of
  plan limits.

### usage_limits  *(tenant, generic per-metric meter — see [04](./04-database-schema.md))*
Metrics: `ai_tokens`, `ai_cost_usd`, `ai_requests`, `discovery_items`, `opportunity_analysis`,
`company_research`, `proposal_generations`, `extension_batches`, `team_seats`, `storage_mb`,
`active_leads`.

### Example plan limits (illustrative — defined in `plans.limits`)
| Plan | Examples |
|------|----------|
| **Free** | 500 AI requests/mo · 2,000 discovery analyses/mo · 100 proposal generations/mo |
| **Starter** | 5,000 AI requests/mo |
| **Agency** | 50,000 AI requests/mo |

Enforcement is **soft-degrade**: warn at thresholds (`monthly_ai_usage_warning` notification),
queue where possible, block only the specific over-limit task with an upgrade prompt.

---

## 14.7 Usage reporting (answered from `ai_usage_events`)

Which company used most AI · which user used most AI · which model is expensive · which task
consumes most tokens · which provider fails most (× `ai_provider_health_checks`/rate-limit
events) · which API key is exhausted (`ai_api_keys.status`/counters) · free-tier remaining
estimate · paid cost estimate · company revenue vs AI cost. Visibility per role is defined in
[15 · Roles, Permissions & Admin System](./15-roles-permissions-and-admin-system.md) §Usage
Visibility — Sales Executive **never** sees keys, provider accounts, platform cost, or other
companies’ usage.

---

## 14.8 Privacy mode

`organizations.settings.privacy_mode` (and optional per-task override):

| Mode | Behavior |
|------|----------|
| `free_api_allowed` | free/low-cost APIs may receive (redacted) input |
| `redact_pii_before_ai` | **v1 default** — redact PII before any external call |
| `paid_only` | only paid provider accounts may be used |
| `byok_only` | only the org’s own key (`integration_accounts` type `ai_provider`) |
| `disabled` | no external AI; deterministic-only features |

**Redaction (before free APIs)** strips/uses placeholders for: email, phone, personal names
(when not required for the task), exact/sensitive URLs, private notes, internal pricing, and
sensitive attachments. Redaction is applied in the gateway, logged on `ai_requests.request_ref`
(redacted reference only — never the raw PII), and covered by tests
(`ai_pii_redaction`). See [12 · Data Lifecycle & Governance](./12-data-lifecycle-and-governance.md).

---

## 14.9 Free-first model strategy

> Order of preference. **Deterministic always wins** when it can answer — don’t spend a token on
> rule-matching or arithmetic.

```
Deterministic first
  ↓ Free/local model if available (self-hosted Ollama, only when private deployment enabled)
  ↓ Free API model (Gemini free tier)
  ↓ Low-cost API model (Groq free/low-cost)
  ↓ Premium paid model — only when a task genuinely needs it, later
```

**v1 provider strategy:** Primary **Gemini free tier** · fast fallback **Groq** ·
experimental fallback **OpenRouter free models** · private/local future **Ollama** (self-hosted
only) · embeddings **Gemini Embedding @ 1536 dims** (matches `vector(1536)`) · premium future
**Claude / paid Gemini / paid Groq / BYOK** as an optional premium route. **Do not** default to
Claude Opus/Sonnet.

### Default model/process routing (seed `ai_task_routes`)
| Task / process | Routing |
|----------------|---------|
| Bad-lead filtering | **no model** — deterministic Company Brain rules |
| Scoring v1 | **no model** — deterministic weighted heuristic |
| Opportunity Analyzer | Gemini free → Groq fallback · **strict JSON schema** |
| Action Planner | Groq fast → Gemini free · short structured reasoning |
| Company Research | Gemini free → Groq fallback (+ allowed tools) |
| Sales Message | Gemini/Groq by availability |
| Follow-up | Groq fast |
| Conversation summary | Groq fast |
| Proposal | best available **free** model first; premium only later for high-value proposals |
| Embeddings | Gemini Embedding @ 1536 dims |
| Learning summary | Gemini or Groq |
| Forecasting | **no model first** — deterministic stats |

---

## 14.10 Admin surface & APIs

Master Admin manages this system at `/admin/ai-providers`, `/admin/api-keys`, `/admin/ai-routing`,
`/admin/ai-usage`, `/admin/system-health`. APIs in [05 · API Structure](./05-api-structure.md)
under `/admin/ai/*`. Routing rules, keys, and provider accounts require
`platform.ai_providers.manage` / `platform.ai_routes.manage` and are **out of reach** for any
tenant role.

---

## 14.11 What this system is **not**

- **Not** an API-key-rotation scheme to bypass provider free-tier or rate limits.
- **Not** an account-farming or aggressive-signup system.
- **Not** a single-provider wrapper — any provider can be added or removed via tables.
- **Not** a black box — every call is logged, metered, prompt-versioned, and auditable.
