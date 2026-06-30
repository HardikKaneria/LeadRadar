# 01 — Vision & Principles

## The problem

Agencies and freelancers lose revenue not because there's no demand, but because they
spend hours **hunting** for opportunities and then can't tell which one is worth their
time today. The cost is twofold: wasted hours scanning marketplaces, and the silent loss
of high-intent buyers who picked someone faster.

## The product thesis

> Reduce manual lead hunting by **80–90%** by turning every signal into a scored,
> explained, prioritized opportunity — and tell the user the single highest-EV action
> to take right now.

Radar is a **decision engine**, not a record-keeping system.

| Traditional CRM | Radar OIP |
|-----------------|-----------|
| Stores what happened | Recommends what to do next |
| Human enters everything | Capture + AI does the heavy lifting |
| Reports on the past | Predicts and prioritizes the future |
| Pipeline hygiene | Revenue-per-hour optimization |
| Static lead scores | Scores that **learn** from outcomes |

## What success looks like

- The user opens the app and the **Daily Action Center** tells them: _"Contact ABC Corp
  today — high-intent WooCommerce need, ~$5,000, expires soon."_ with a one-click
  AI-drafted message.
- A discovery captured from LinkedIn is analyzed, scored, and surfaced for approval in
  under a minute, with a human-readable reason.
- Six months in, the system scores a "WooCommerce / USA" opportunity higher than it did
  on day one **because similar ones converted** — without anyone editing a rule.

## Design principles

1. **Action over administration.** Every screen should drive a decision. If a feature
   only records data, question it.
2. **AI is a replaceable utility.** All model calls go through one gateway. Swapping
   Groq → Gemini → Ollama is a config change, never a rewrite.
3. **Data sovereignty.** Raw captures, analyses, and outcomes live in *our* Postgres.
   We never depend on a vendor to own or re-derive our knowledge.
4. **Store raw first, interpret later.** Discoveries are persisted verbatim before any
   AI touches them, so we can re-analyze when models improve.
5. **Human-in-the-loop by design.** AI proposes; a human approves before a discovery
   becomes an opportunity. Capture is human-triggered. No bans, no dark patterns.
6. **Explainability is a feature.** Every score ships with a reason. Users trust what
   they understand.
7. **The learning loop is the moat.** Outcomes (wins/losses) feed back into scoring.
   This compounding advantage is the product's defensibility.
8. **Multi-tenant from line one.** Every row is org-scoped; no retrofit later.
9. **Boundaries before services.** Start as a modular monolith with strict module
   boundaries so any module can later be extracted into a service without surgery.

## Explicit non-goals (for now)

- No aggressive/background scraping, auto-scroll, or crawling.
- No becoming a full CRM with quoting, invoicing, and accounting.
- No outbound auto-send without human review.
- No single-tenant on-prem builds in v1.

## Primary user

The **Sales Executive** is the primary daily user — the opportunity hunter who searches
platforms, captures visible opportunities, triages the Discovery Inbox, and runs outreach. Above
them sit the **Company Admin** (team owner) and the **Master Admin** (platform operator). The
whole product is tuned for the Sales Executive's day. See
[15 · Roles & Permissions](./15-roles-permissions-and-admin-system.md).

## Guardrails the architecture must enforce

- Capture only what is **visible on screen** at the moment the user clicks.
- AI calls are **rate-limited, cost-tracked, quota-aware, and auditable**.
- **Free-first AI routing** through a legitimate provider key pool — never free-tier abuse or
  key-rotation to bypass provider limits ([14](./14-ai-provider-and-usage-system.md)).
- **AI is provider-independent** — no dependence on Claude/OpenAI/Gemini/Groq or any single vendor.
- **Privacy mode** (default `redact_pii_before_ai`) redacts PII before free-API calls.
- **Usage & billing tracking work from day one**, even while the AI APIs are free.
- Every destructive action is reversible or audit-logged.
- PII is encrypted at rest where required and access is org-scoped + RBAC-gated.
