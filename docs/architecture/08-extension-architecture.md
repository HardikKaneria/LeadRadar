# 08 — Extension Architecture (Chrome MV3)

> **Primary user: the Sales Executive** — the opportunity hunter (see
> [15 · Roles & Permissions](./15-roles-permissions-and-admin-system.md)). Flow: the user
> searches a platform normally → clicks **Capture Current Results** → the extension captures only
> visible DOM items → the user reviews/deselects items and can add notes/source/service hint →
> the batch is sent with a **scoped capture token** (never the full session JWT) → the platform
> stores a raw `discovery_batch` + `discoveries` → AI analysis job starts → results land in the
> Sales Executive's Discovery Inbox.

## Hard constraints (from the brief)

- **Human-assisted only.** Capture happens when the user clicks "Capture Current Results".
- **Visible data only.** Read what is currently rendered on screen — no pagination,
  no auto-scroll, no crawling, no background fetching of other pages.
- **No automation that risks bans.** No simulated clicks/scrolls, no headless loops,
  no rate-defeating behavior. The user drives their normal browsing; we just snapshot.
- **Store raw first.** The extension sends raw extracted fields; interpretation is the
  platform's job.

## Components (Manifest V3)

```
extension/
├── manifest.json            # MV3, minimal host permissions, no broad content scripts
├── src/
│   ├── background/          # service worker: auth token, send-to-platform, queueing
│   │   └── service-worker.ts
│   ├── content/             # injected ONLY on supported sites, ONLY on user action
│   │   ├── capture.ts       # reads visible DOM, runs the site parser
│   │   └── overlay.ts       # in-page confirm UI ("N items found — review & send")
│   ├── popup/               # toolbar popup: login, status, "Capture Current Results"
│   │   └── popup.tsx
│   ├── parsers/             # per-site extractors (pure functions, visible nodes only)
│   │   ├── linkedin.ts
│   │   ├── upwork.ts
│   │   ├── freelancer.ts
│   │   └── generic.ts       # fallback: page title/meta/visible text + selected text
│   ├── options/             # settings: account, default org, capture preferences
│   └── lib/
│       ├── api-client.ts    # talks to /ingest/extension with scoped token
│       ├── normalize.ts     # shared field normalization
│       └── schema.ts        # zod schema shared with packages/contracts
```

## Capture flow

```
User searches normally on LinkedIn/Upwork/etc.
        │
        ▼
Clicks toolbar popup → "Capture Current Results"
        │  (user gesture required)
        ▼
Background injects content/capture.ts into the active tab
        │
        ▼
Parser reads ONLY visible result nodes → array of raw items
        │
        ▼
overlay.ts shows "Found N items — review & send" (user can deselect)
        │
        ▼
User confirms → background POST /ingest/extension
        (batch payload + Idempotency-Key + source + scoped token)
        │
        ▼
Platform stores discovery_batch + discoveries (status=new) → analysis enqueued
        │
        ▼
Popup shows "Sent N items to Radar" + link to Inbox
```

## Payload contract (shared via `packages/contracts`)

```jsonc
POST /ingest/extension
{
  // full discovery_source enum: linkedin|upwork|freelancer|website|referral|manual|csv|
  //   whatsapp|email|existing_customer|conference|client_call|partnership|other
  "source": "linkedin",
  "captured_url": "https://...",        // page the user was on
  "captured_at": "2026-06-22T10:00:00Z",
  "items": [
    {
      "title": "Need WooCommerce developer",
      "description": "...visible snippet...",
      "company_name": "ABC Corp",
      "contact_name": null,
      "url": "https://...",             // the item's link if visible
      "country": "USA",
      "budget_hint": "5000",
      "raw": { /* parser-specific visible fields */ }
    }
  ]
}
```

## Permissions & privacy

- `manifest.json` requests **activeTab** + explicit host permissions only for supported
  sites; **no** `<all_urls>`, no `tabs` background access, no persistent content scripts.
- Content script injected on demand (user gesture), removed after capture.
- Auth: short-lived **scoped capture token** backed by the `extension_tokens` table (only a
  `token_hash` is stored; managed in **Settings → Extension**: generate, view status/last
  batches, parser-version health, revoke). Scopes are limited to `discovery.capture` and
  `discovery.read_own_batches` — never the full session JWT, never write access to opportunities/leads.
- Only fields needed for opportunity analysis leave the browser; raw HTML snapshot is
  optional and user-toggleable.

## Resilience

- Offline/failed send → queued in `chrome.storage`, retried by the service worker.
- Idempotency key per batch prevents duplicates on retry.
- Parser versioning: each parser reports a `version`; platform stores it on the batch so
  broken site changes are diagnosable.
- Graceful fallback to `generic.ts` (title/meta/selected text) when a site parser fails.
