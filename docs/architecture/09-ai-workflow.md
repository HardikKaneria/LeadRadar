# 09 — AI Workflow

The AI layer is **replaceable by design**. Nothing in the domain knows which provider ran.

## 9.1 The abstraction (AI Gateway — `packages/ai`)

```ts
interface AIService {
  generate(req: GenerateRequest): Promise<GenerateResult>;            // free-form text
  generateStructured<T>(req: StructuredRequest<T>): Promise<T>;       // schema-validated JSON
  embed(req: EmbedRequest): Promise<number[]>;                        // vector
}

interface AIProvider {                  // implemented per vendor
  name: 'groq' | 'gemini' | 'ollama' | 'openai-compatible';
  complete(prompt, opts): Promise<RawCompletion>;
  embed(input, opts): Promise<number[]>;
  capabilities(): { json: boolean; embed: boolean; maxTokens: number };
}
```

- **Adapters:** `GroqAdapter`, `GeminiAdapter`, `OllamaAdapter`, `OpenAICompatibleAdapter`.
- **Provider registry** per org: ordered list with priority + per-agent overrides
  (e.g. analyzer → Groq, embeddings → Ollama local). Keys stored encrypted.
- **Router** picks a provider by capability + priority + health + cost cap.
- **Resilience:** timeout, retry with backoff, **fallback** to next provider, circuit
  breaker per provider.
- **Structured output:** request JSON, validate against a Zod schema; on failure run one
  "repair" pass, else mark `error`. Never let malformed JSON reach the domain.
- **Cost & audit:** every call writes `ai_requests` (provider, model, tokens, cost,
  latency, status, **`ai_prompt_version_id`**). Redis token buckets enforce per-org rate +
  spend caps; usage is metered into `usage_limits` (ai_tokens, ai_cost_usd).
- **Prompt versioning (real & auditable):** prompts live in the **`ai_prompt_versions`**
  table, not just code. System defaults have `organization_id = null`; an org may fork its
  own active version per agent. The gateway resolves the active version at call time, stamps
  `ai_prompt_version_id` on every `ai_request`, and `ai_analysis` stores the version used —
  so every AI output is reproducible. Managed in **Settings → AI**
  (`/ai/prompts`, `/ai/prompts/:id/activate`).

```
domain module → AIService → Router → [Adapter → Provider] → validate → record ai_request
                                   └── fallback on failure ──┘
```

> **Single entry point.** The domain only ever calls
> `AIService.generate(taskType, input, organizationId, userId)` (also `generateStructured`,
> `embed`) — never a provider SDK. The full provider key pool, model router, usage ledger,
> quotas/credits, and provider health live in
> [14 · AI Provider & Usage System](./14-ai-provider-and-usage-system.md); this file covers the
> agents + prompts that run on top of it.

## 9.1b Free-first model strategy (no single-provider default)

```
Deterministic first
  ↓ Free/local model (self-hosted Ollama, only if private deployment enabled)
  ↓ Free API model (Gemini free tier)
  ↓ Low-cost API model (Groq free/low-cost)
  ↓ Premium paid model — only when a task genuinely needs it, later
```

**Do not default to Claude Opus/Sonnet.** v1: Gemini free tier (primary) → Groq (fast fallback) →
OpenRouter free models (experimental). Embeddings: Gemini Embedding @ **1536 dims** (matches
`vector(1536)`). Claude / paid Gemini/Groq / BYOK are an optional **premium** route later.

**Default model/process routing** (seeds `ai_task_routes`):

| Process | Routing |
|---------|---------|
| Bad-lead filtering · Scoring v1 · Forecasting (v1) | **no model** — deterministic |
| Opportunity Analyzer | Gemini free → Groq · **strict JSON schema** |
| Action Planner | Groq fast → Gemini free |
| Company Research | Gemini free → Groq |
| Sales message / follow-up / summary | Gemini/Groq by availability (follow-up & summary → Groq fast) |
| Proposal | best free model first; premium only later for high-value proposals |
| Embeddings | Gemini Embedding @ 1536 dims |
| Learning summary | Gemini or Groq |

## 9.1c Privacy mode

`organizations.settings.privacy_mode` controls what may leave for an external API
(`free_api_allowed` / `redact_pii_before_ai` (**v1 default**) / `paid_only` / `byok_only` /
`disabled`). In redact mode the gateway strips PII (email, phone, personal names, sensitive URLs,
private notes, internal pricing, sensitive attachments) **before** any free-API call and stores
only a redacted reference on `ai_requests.request_ref`. Full policy in
[12 · Data Lifecycle & Governance](./12-data-lifecycle-and-governance.md) and
[14 §14.8](./14-ai-provider-and-usage-system.md).

## 9.2 The agents (M5, on top of the gateway)

Each agent = **input schema + Company-Brain context + prompt template + output Zod schema
+ post-processing**. Agents run in the **Worker** (async) except the Sales Assistant
(on-demand, can be sync).

### Agent 1 — Opportunity Analyzer
- **Input:** raw discovery + active `company_profile` (services, ICP, countries, budget,
  bad-lead rules) + active `scoring_strategy`.
- **Output (validated):**
  ```json
  { "score": 0-100, "intent": "high|medium|low|unclear",
    "service_match": [{"service":"WooCommerce","confidence":0.0-1.0}],
    "budget_estimate": 5000, "urgency": "urgent|soon|later|none",
    "confidence": 0.0-1.0, "recommended_action": "Contact today",
    "reason": "High-intent WooCommerce requirement matching priority service" }
  ```
- Applies bad-lead rules (hard filter) before/after the model; blends model score with the
  scoring strategy's weights. Writes `ai_analysis` + embedding. Example:
  _"Need WooCommerce developer urgently" → score 95, action "Contact today"._

### Agent 2 — Company Research Agent
- **Input:** company name/domain/website (+ optional visible snapshot).
- **Output:** industry, detected tech stack, likely problems, **suggested services**,
  enrichment confidence. Writes to `companies.enrichment` + `tech_stack`.

### Agent 3 — Action Planner
- **Input:** analyzed discovery/opportunity + pipeline state.
- **Output:** **next best action**, priority (`critical / high / medium / low`, with an
  internal `priority_weight`), recommended timeline/`due_at`.
- Feeds opportunity `recommended_action` and can auto-create the first `task`.

### Agent 4 — AI Sales Assistant (M11, on-demand)
- Generate message, generate follow-up, summarize conversation, create proposal, prepare
  meeting questions, suggest next action — scoped to an opportunity/lead's context.
- **Persistence:** generated messages are stored in `outreach_messages`
  (`is_ai_generated=true`, linked `ai_request_id`) and threaded into `conversations`;
  templates come from `message_templates`. Proposals are written to the `proposals` table
  (status lifecycle) with the rendered file in `attachments`. The conversation `summary` is
  itself AI-maintained. This gives the assistant durable context for future follow-ups and
  feeds engagement signals (opened/replied) into heat score and the Learning Engine.

## 9.3 Scoring & the learning loop (M12)

Scoring is an interface so it can evolve without touching agents:

```ts
interface ScoringStrategy {
  score(features: OpportunityFeatures, ctx: OrgContext): ScoreResult; // {score, weights, reason}
}
```

- **v1 — Heuristic:** weighted features (service match, priority service, country fit,
  budget vs. min, intent, urgency) using `scoring_strategies.weights`. Deterministic,
  explainable on day one.
- **v2 — Statistical:** Learning Engine aggregates `knowledge_events` (wins/losses +
  feature snapshots) → recomputes weights per org (e.g. logistic regression / calibrated
  conversion rates by feature bucket). Publishes a new active `scoring_strategy`.
- **v3 — ML/embeddings:** similarity to past **won** opportunities (pgvector) contributes
  to the score; optional fine-tune.

**Loop:** outcome (`won/lost`) → `knowledge_event` (with feature snapshot + embedding) →
`recompute-scoring` job → new active strategy → future analyses score better. Example:
_"WooCommerce / USA" was 70 → after similar deals close, becomes 90._

## 9.4 Advanced AI-powered features (M12 mechanisms)

| Feature | How |
|---------|-----|
| Heat score | `score × recency_decay × engagement × urgency`, recomputed on events/cron |
| Expiry prediction | Survival/regression over historical time-to-close + urgency decay → `expires_at` |
| Similar opportunity finder | pgvector k-NN over `discoveries`/`opportunities` embeddings |
| Opportunity clustering | Embedding clustering → named demand themes |
| Demand radar | Cluster volume/velocity over time + source → trending demand |
| Lead resurrection | Match dormant `lost/on_hold` leads against new high-demand clusters |
| Revenue forecasting | Σ (conversion_prob(score, stage) × value) across pipeline |

## 9.5 Safety, cost, governance

- Per-org + per-provider rate limits and monthly spend caps (Redis); degrade by queueing,
  not failing.
- Full auditability via `ai_requests`; PII minimized in prompts and redacted in stored refs.
- Prompt-injection defense: discovery text is treated as untrusted data, never as
  instructions (clear delimiting + system-prompt guarding).
- Re-analysis is cheap and safe (raw stored), so model upgrades reprocess history on demand.
