# LinkedIn Lead Hunting Research Pipeline — Complete Documentation

## 1. Purpose

This document defines the upgraded lead hunting system for Radar OIP. The goal is to let a Sales Executive search LinkedIn normally, capture all visible posts from the search/results page, send those posts into the system, fully research every unique post, and only then decide whether the post is:

- Qualified Lead
- Needs Review
- Informational Archive
- Market Intelligence
- Rejected / Spam

The system must support full-depth enrichment for every post, external data providers such as Bright Data, Apify, ScraperAPI, Firecrawl, Tavily, SerpApi, and People Data Labs, and a platform-managed provider key pool with multiple approved API keys per provider.

The system must be built as an extension of the current Radar OIP architecture, not a rebuild.

---

## 2. Product Rule

### Old logic to remove

```text
Low intent  -> shallow enrichment
Medium intent -> search + website crawl
High intent -> full enrichment
```

### New logic

```text
Every unique captured post -> full enrichment -> AI classification -> CRM / archive decision
```

The system must not skip research because a post looks low intent at first. Many useful leads are hidden inside informational-looking posts, founder updates, hiring posts, complaints, or indirect client requirement posts.

---

## 3. Compliance and Safety Boundary

The product supports human-assisted capture and provider-based research. It must not be designed around hidden automation, fake accounts, cookie/session theft, CAPTCHA evasion, or aggressive LinkedIn crawling.

### Extension boundary

The Chrome extension should:

- Capture only after the user clicks a button.
- Capture only currently visible posts/results.
- Show a review overlay before sending.
- Send data through a scoped capture token.
- Never store provider API keys.
- Never use the user's full session JWT.
- Never auto-scroll, auto-click, or crawl pages in the background.

### Provider key boundary

The system can support multiple API keys for the same provider, but only as a legitimate capacity pool.

Allowed:

- Multiple approved accounts/keys owned by the platform.
- Multiple paid/subaccount/workspace keys allowed by the provider.
- BYOK keys supplied by customer organizations where appropriate.
- Per-key quota tracking.
- Per-key cooldown when rate limited.
- Fallback to another eligible key/provider.
- Usage logging and audit.

Not allowed:

- Creating fake accounts to reset free limits.
- Rotating keys to bypass provider terms.
- Ignoring retry-after/rate-limit responses.
- Storing keys in frontend or extension.
- Exposing platform provider keys to Company Admin or Sales Executive.

---

## 4. High-Level Architecture

```text
Chrome Extension
    ↓
LinkedIn Search Capture
    ↓
Ingestion API
    ↓
Raw Posts / Discoveries
    ↓
Deduplication
    ↓
Full Research Queue
    ↓
External Provider Orchestrator
        ↓
        Bright Data / Apify / PDL / Tavily / SerpApi / Firecrawl / ScraperAPI
    ↓
Person Resolver
    ↓
Company Resolver
    ↓
Website Finder
    ↓
Website Research Engine
    ↓
Email Finder
    ↓
Management Finder
    ↓
Country Resolver
    ↓
Evidence Builder
    ↓
AI Post Classifier
    ↓
Qualified Lead / Needs Review / Archive / Reject
    ↓
Discovery Inbox
    ↓
Human Approval
    ↓
Opportunity
    ↓
Lead Pipeline + Follow-Up
    ↓
Outcome
    ↓
Knowledge + Learning
```

---

## 5. New Module

## M16 · Lead Hunting Research Pipeline

### Purpose

M16 takes captured LinkedIn posts and runs full enrichment before classification.

### Owns

- `lead_search_sessions`
- `raw_posts`
- `post_research_jobs`
- `post_research_reports`
- `post_classifications`
- `archived_posts`
- `field_evidence_logs`
- `external_provider_accounts`
- `external_api_keys`
- `external_provider_routes`
- `external_provider_calls`
- `external_usage_events`
- `external_provider_health_checks`
- `external_provider_rate_limit_events`

### Depends on

- M2 · Discovery & Ingestion
- M4 · AI Gateway
- M5 · AI Intelligence
- M7 · Company & Contact Graph
- M9 · Lead Pipeline
- M10 · Follow-Up Intelligence
- M13 · Activity, Notes & Audit
- M15 · AI Provider & Usage System

### Core responsibility

```text
Take captured post data
↓
Research every unique post
↓
Resolve person/company/website/email/management/country
↓
Attach confidence + evidence
↓
Classify post
↓
Move to qualified lead / needs review / archive / reject
```

---

## 6. Capture Flow

### User flow

```text
Sales Executive searches LinkedIn
↓
Clicks extension button: Capture Current Results
↓
Extension reads visible posts only
↓
Overlay shows found posts
↓
User deselects unwanted posts if needed
↓
User confirms
↓
Batch sent to backend
↓
Backend creates search session + raw posts
↓
Research jobs are queued
```

### Extension payload

```json
{
  "source": "linkedin",
  "captured_url": "https://linkedin.com/search/results/content/...",
  "captured_at": "2026-06-29T10:00:00+05:30",
  "capture_mode": "visible_posts",
  "search_query": "Shopify developer hiring",
  "parser_version": "linkedin-posts-v2",
  "items": [
    {
      "post_url": "https://www.linkedin.com/posts/...",
      "post_text": "Looking for a Shopify developer for our D2C brand...",
      "post_owner_name": "Rahul Shah",
      "post_owner_headline": "Founder at GrowthLabs",
      "post_owner_profile_url": "https://www.linkedin.com/in/...",
      "visible_company_name": "GrowthLabs",
      "visible_company_url": null,
      "post_date": "2026-06-28",
      "reaction_count": 32,
      "comment_count": 14,
      "repost_count": 2,
      "media_text": null,
      "raw": {}
    }
  ]
}
```

---

## 7. Full Research Pipeline

Every unique post must pass through these stages.

```text
raw_captured
↓
duplicate_check
↓
queued_for_research
↓
provider_post_lookup
↓
person_resolved
↓
company_resolved
↓
website_found
↓
website_researched
↓
email_checked
↓
management_found
↓
country_resolved
↓
evidence_built
↓
ai_classified
↓
qualified_lead / needs_review / archived / rejected
```

---

## 8. Deduplication Logic

Before spending provider/API credits, deduplicate the post.

### Dedup keys

```text
1. post_url
2. normalized post_text hash
3. post_owner_profile_url + post_text_hash
4. post_owner_name + post_date + first 160 chars hash
5. visible_company_name + post_text_hash
```

### Result

If duplicate:

```text
Mark as duplicate_linked.
Attach the capture session to the existing post.
Do not call providers again.
Do not create duplicate CRM entities.
```

If unique:

```text
Queue full research.
```

---

## 9. External Provider Orchestrator

## 9.1 Purpose

The External Provider Orchestrator is the single backend service that calls non-AI research providers.

No module should directly call Bright Data, Apify, PDL, Tavily, Firecrawl, ScraperAPI, or any other provider SDK/API.

### Service contract

```ts
ExternalProviderService.call(taskType, input, context): Promise<ProviderResult>
```

### Task types

```text
linkedin_post_lookup
linkedin_profile_lookup
linkedin_company_lookup
person_enrichment
company_enrichment
website_discovery
website_crawl
email_discovery
management_discovery
country_resolution
tech_stack_detection
public_search
```

---

## 9.2 Provider route examples

### linkedin_post_lookup

```text
1. Bright Data LinkedIn post dataset
2. Apify LinkedIn post actor
3. Manual visible payload fallback
```

### linkedin_profile_lookup

```text
1. Bright Data LinkedIn profile dataset
2. Apify LinkedIn profile actor
3. People Data Labs person enrichment
4. Tavily / SerpApi public search fallback
```

### linkedin_company_lookup

```text
1. Bright Data LinkedIn company dataset
2. Apify LinkedIn company actor
3. People Data Labs company enrichment
4. Website discovery fallback
```

### website_discovery

```text
1. Domain from provider data
2. Domain from post text
3. Tavily search
4. SerpApi search
5. Company name + country search
6. Person name + company name search
```

### website_crawl

```text
1. Firecrawl
2. Internal crawler
3. ScraperAPI fallback for blocked public websites
```

### email_discovery

```text
1. Website contact/about/footer/team pages
2. Public emails from website
3. Provider enrichment if enabled
4. Pattern generation only if domain is verified
5. Mark guessed emails separately
```

### management_discovery

```text
1. Website team page
2. About page
3. Blog author pages
4. Provider company data
5. Public search
```

---

## 9.3 Provider key selection logic

```text
Input: task_type, provider_route, organization_id, user_id

1. Load active external_provider_route for task_type.
2. Check organization external usage limit.
3. Check provider health.
4. Select provider in priority order.
5. Find eligible API key:
   - provider matches
   - status = active
   - allowed_task_types includes task_type
   - daily/monthly limits not exhausted
   - cooldown_until is null or in the past
   - environment matches app environment
6. Reserve usage slot.
7. Call provider.
8. Normalize response.
9. Save technical call log.
10. Save usage ledger event.
11. Update API key counters.
12. Save evidence.
13. On rate limit:
   - record rate-limit event
   - set key to cooldown
   - respect retry_after
   - fallback to next eligible key/provider
14. If all fail:
   - mark job failed or needs_review
   - never crash entire pipeline
```

---

## 9.4 Multiple API keys for the same provider

### Goal

Keep the system running across the whole month by distributing legitimate workload across approved provider capacity.

### Rules

```text
Same provider can have many provider accounts.
Each provider account can have many API keys.
Each key has its own allowed task types, limits, usage counters, status, and cooldown.
Routing must respect all provider and account limits.
```

### Key states

```text
active
limited
cooldown
exhausted
failed
revoked
```

### Selection strategy

Use weighted quota-aware routing, not blind round robin.

```text
eligible_keys = active keys for provider + task_type
remove keys over daily limit
remove keys over monthly limit
remove keys in cooldown
remove failed/revoked keys

sort by:
1. health status
2. remaining monthly quota percentage
3. remaining daily quota percentage
4. lowest recent error rate
5. least recent use
```

### Example

```text
Provider: Bright Data

Key A:
- limit: 5,000 records/month
- used: 4,800
- status: active
- remaining: 4%

Key B:
- limit: 5,000 records/month
- used: 1,200
- status: active
- remaining: 76%

Router should prefer Key B.
```

### Monthly reset

Every provider key should have:

```text
billing_period_start
billing_period_end
reset_timezone
last_reset_at
next_reset_at
```

A scheduled job resets counters only at the configured reset date, never manually to bypass limits.

---

## 10. API Keys Required

## 10.1 Core app

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
ENCRYPTION_KEY=
APP_WEBHOOK_SECRET=
CHROME_EXTENSION_ID=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

## 10.2 External provider keys

```env
BRIGHTDATA_API_KEY=
BRIGHTDATA_LINKEDIN_POST_DATASET_ID=
BRIGHTDATA_LINKEDIN_PROFILE_DATASET_ID=
BRIGHTDATA_LINKEDIN_COMPANY_DATASET_ID=

APIFY_TOKEN=
APIFY_LINKEDIN_POST_ACTOR_ID=
APIFY_LINKEDIN_PROFILE_ACTOR_ID=
APIFY_LINKEDIN_COMPANY_ACTOR_ID=

PDL_API_KEY=
TAVILY_API_KEY=
SERPAPI_API_KEY=
FIRECRAWL_API_KEY=
SCRAPERAPI_KEY=
```

## 10.3 Optional enrichment keys

```env
APOLLO_API_KEY=
HUNTER_API_KEY=
WAPPALYZER_API_KEY=
BUILTWITH_API_KEY=
```

## 10.4 AI keys

```env
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=
```

### Important

Environment keys are allowed for local development, but production keys must be stored encrypted in database tables and managed from the Master Admin provider pages.

---

## 11. Database Structure

All tenant-owned business tables must include:

```sql
organization_id uuid not null,
created_at timestamptz not null default now(),
updated_at timestamptz,
deleted_at timestamptz
```

All provider key tables are platform-managed and must not be tenant-visible except usage summaries.

---

## 11.1 lead_search_sessions

```sql
create table lead_search_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  source_platform text not null default 'linkedin',
  search_query text,
  search_url text,
  captured_by_user_id uuid references users(id),
  capture_mode text not null default 'visible_posts',
  total_posts_captured int not null default 0,
  total_unique_posts int not null default 0,
  total_duplicates int not null default 0,
  total_qualified int not null default 0,
  total_needs_review int not null default 0,
  total_archived int not null default 0,
  total_rejected int not null default 0,
  status text not null default 'captured',
  parser_version text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
```

Indexes:

```sql
create index idx_lead_search_sessions_org_created
on lead_search_sessions (organization_id, created_at desc);

create index idx_lead_search_sessions_user_created
on lead_search_sessions (organization_id, captured_by_user_id, created_at desc);
```

---

## 11.2 raw_posts

```sql
create table raw_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  search_session_id uuid references lead_search_sessions(id),
  discovery_id uuid references discoveries(id),
  source_platform text not null default 'linkedin',

  post_url text,
  post_text text,
  post_text_hash text,
  post_owner_name text,
  post_owner_headline text,
  post_owner_profile_url text,
  visible_company_name text,
  visible_company_url text,
  post_date timestamptz,
  reaction_count int,
  comment_count int,
  repost_count int,
  media_text text,

  dedup_hash text not null,
  duplicate_of_raw_post_id uuid references raw_posts(id),

  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'raw_captured',
  failure_reason text,

  captured_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
```

Unique index:

```sql
create unique index uniq_raw_posts_org_dedup
on raw_posts (organization_id, dedup_hash)
where deleted_at is null;
```

---

## 11.3 post_research_jobs

```sql
create table post_research_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid not null references raw_posts(id),
  job_run_id uuid references job_runs(id),
  current_stage text not null,
  status text not null default 'queued',
  progress int not null default 0,
  retry_count int not null default 0,
  max_retries int not null default 3,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

---

## 11.4 resolved_people

This can either extend existing `contacts` or act as a staging table before canonical contact merge.

```sql
create table resolved_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid references raw_posts(id),
  contact_id uuid references contacts(id),

  full_name text,
  first_name text,
  last_name text,
  title text,
  seniority text,
  department text,
  linkedin_url text,
  email citext,
  email_status text,
  country text,
  city text,

  current_company_name text,
  current_company_domain text,
  current_company_id uuid references companies(id),

  confidence_score numeric(5,2),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
```

---

## 11.5 resolved_companies

This can either extend existing `companies` or act as a staging table before canonical company merge.

```sql
create table resolved_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid references raw_posts(id),
  company_id uuid references companies(id),

  relationship_type text not null,
  name text,
  domain citext,
  website text,
  linkedin_url text,
  industry text,
  country text,
  city text,
  employee_count text,
  description text,

  confidence_score numeric(5,2),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);
```

Relationship types:

```text
post_owner_current_company
mentioned_company
target_opportunity_company
client_company
unknown
```

---

## 11.6 post_research_reports

```sql
create table post_research_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid not null references raw_posts(id),

  person_summary text,
  company_summary text,
  website_summary text,
  email_summary text,
  management_summary text,
  country_summary text,
  opportunity_summary text,

  resolved_person_id uuid references resolved_people(id),
  primary_company_id uuid references companies(id),
  target_company_id uuid references companies(id),

  confidence_score numeric(5,2),
  report_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

---

## 11.7 post_classifications

```sql
create table post_classifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid not null references raw_posts(id),
  ai_request_id uuid references ai_requests(id),
  ai_prompt_version_id uuid references ai_prompt_versions(id),

  classification text not null,
  lead_score int not null check (lead_score between 0 and 100),
  lead_quality text,
  is_actual_lead boolean not null default false,
  urgency text,
  service_match jsonb not null default '[]'::jsonb,
  reason_json jsonb not null default '[]'::jsonb,
  recommended_action text,

  created_at timestamptz not null default now()
);
```

Classifications:

```text
actual_requirement
hiring_requirement
service_needed
vendor_needed
partnership_opportunity
funding_signal
expansion_signal
complaint_or_pain_signal
buying_intent_signal
informational_post
personal_branding_post
news_update
promotion_only
job_seeker_post
irrelevant
spam
```

---

## 11.8 archived_posts

```sql
create table archived_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  raw_post_id uuid not null references raw_posts(id),
  archive_category text not null,
  topic text,
  summary text,
  keywords text[],
  reason_for_archive text,
  market_signal_score int,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Archive categories:

```text
market_insight
competitor_activity
industry_news
educational_content
personal_branding
general_update
irrelevant
spam
```

---

## 11.9 field_evidence_logs

```sql
create table field_evidence_logs (
  id bigserial primary key,
  organization_id uuid not null references organizations(id),

  entity_type text not null,
  entity_id uuid not null,
  raw_post_id uuid references raw_posts(id),

  field_name text not null,
  field_value text,
  source_provider text,
  source_type text,
  source_url text,
  confidence_score numeric(5,2),
  evidence_text text,
  evidence_json jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);
```

Example fields:

```text
person.full_name
person.title
person.current_company
company.website
company.country
email.value
management.founder
country.value
classification.lead_score
```

---

## 11.10 external_provider_accounts

```sql
create table external_provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  account_name text not null,
  account_type text not null,
  billing_owner text,
  status text not null default 'active',

  monthly_budget numeric(12,2),
  monthly_usage numeric(12,2) not null default 0,
  rate_limit_rpm int,
  rate_limit_daily int,
  rate_limit_monthly int,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

Providers:

```text
brightdata
apify
scraperapi
firecrawl
tavily
serpapi
peopledatalabs
apollo
hunter
wappalyzer
other
```

---

## 11.11 external_api_keys

```sql
create table external_api_keys (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references external_provider_accounts(id),
  provider text not null,
  key_name text not null,

  encrypted_api_key bytea not null,
  status text not null default 'active',
  environment text not null default 'production',

  allowed_task_types text[] not null default '{}',
  daily_request_limit int,
  monthly_request_limit int,
  monthly_record_limit int,
  monthly_cost_limit numeric(12,2),

  requests_used_today int not null default 0,
  requests_used_month int not null default 0,
  records_used_month int not null default 0,
  cost_used_month numeric(12,2) not null default 0,

  billing_period_start timestamptz,
  billing_period_end timestamptz,
  reset_timezone text default 'UTC',
  last_reset_at timestamptz,
  next_reset_at timestamptz,

  last_used_at timestamptz,
  last_error text,
  error_count int not null default 0,
  cooldown_until timestamptz,

  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  revoked_at timestamptz
);
```

Indexes:

```sql
create index idx_external_api_keys_provider_status
on external_api_keys (provider, status);

create index idx_external_api_keys_status_cooldown
on external_api_keys (status, cooldown_until);
```

---

## 11.12 external_provider_routes

```sql
create table external_provider_routes (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  primary_provider text not null,
  fallback_provider text,
  fallback_2_provider text,
  fallback_3_provider text,

  requires_json boolean not null default true,
  expected_cost_per_call numeric(10,5),
  max_retries int not null default 2,
  timeout_ms int not null default 60000,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

Unique:

```sql
create unique index uniq_external_provider_routes_active
on external_provider_routes (task_type)
where is_active = true;
```

---

## 11.13 external_provider_calls

Technical log, one row per API attempt.

```sql
create table external_provider_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  user_id uuid references users(id),

  task_type text not null,
  provider text not null,
  provider_account_id uuid references external_provider_accounts(id),
  api_key_id uuid references external_api_keys(id),

  raw_post_id uuid references raw_posts(id),
  job_run_id uuid references job_runs(id),

  request_ref jsonb,
  response_ref jsonb,
  status text not null,
  http_status int,
  records_returned int,
  estimated_cost numeric(12,6),
  latency_ms int,
  error text,

  created_at timestamptz not null default now()
);
```

---

## 11.14 external_usage_events

Billing/usage ledger, one row per billable/successful provider usage event.

```sql
create table external_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid references users(id),

  provider text not null,
  task_type text not null,
  external_provider_call_id uuid references external_provider_calls(id),
  api_key_id uuid references external_api_keys(id),
  provider_account_id uuid references external_provider_accounts(id),

  records_used int not null default 0,
  requests_used int not null default 1,
  estimated_cost numeric(12,6) not null default 0,
  is_free_tier boolean not null default false,
  status text not null default 'ok',

  created_at timestamptz not null default now()
);
```

Indexes:

```sql
create index idx_external_usage_org_created
on external_usage_events (organization_id, created_at desc);

create index idx_external_usage_key_created
on external_usage_events (api_key_id, created_at desc);

create index idx_external_usage_provider_task
on external_usage_events (provider, task_type, created_at desc);
```

---

## 11.15 external_provider_rate_limit_events

```sql
create table external_provider_rate_limit_events (
  id bigserial primary key,
  provider text not null,
  provider_account_id uuid references external_provider_accounts(id),
  api_key_id uuid references external_api_keys(id),
  task_type text,
  limit_type text not null,
  occurred_at timestamptz not null default now(),
  retry_after_seconds int,
  detail jsonb not null default '{}'::jsonb
);
```

---

## 11.16 external_provider_health_checks

```sql
create table external_provider_health_checks (
  id bigserial primary key,
  provider text not null,
  provider_account_id uuid references external_provider_accounts(id),
  api_key_id uuid references external_api_keys(id),
  status text not null,
  latency_ms int,
  checked_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);
```

---

## 12. Status Enums

## 12.1 raw_post_status

```text
raw_captured
duplicate_linked
queued_for_research
researching
provider_post_enriched
person_resolved
company_resolved
website_found
website_researched
email_checked
management_found
country_resolved
evidence_built
ai_classified
qualified_lead
needs_review
archived
rejected
failed
cancelled
```

## 12.2 provider_key_status

```text
active
limited
cooldown
exhausted
failed
revoked
```

## 12.3 provider_account_status

```text
active
limited
disabled
```

## 12.4 research_job_stage

```text
dedupe
linkedin_post_lookup
linkedin_profile_lookup
linkedin_company_lookup
person_resolver
company_resolver
website_discovery
website_crawl
email_discovery
management_discovery
country_resolution
evidence_building
ai_classification
decision_routing
```

---

## 13. Research Logic Details

## 13.1 Person Resolver

Input:

```text
post_owner_name
post_owner_headline
post_owner_profile_url
post_text
visible_company_name
provider profile data
public search data
```

Output:

```json
{
  "full_name": "",
  "title": "",
  "seniority": "",
  "department": "",
  "linkedin_url": "",
  "current_company": "",
  "country": "",
  "confidence_score": 0,
  "evidence": []
}
```

Confidence signals:

```text
+30 profile URL matched
+20 provider returned same name
+15 headline/title matched
+15 company matched
+10 country/location matched
+10 email domain matched company
```

---

## 13.2 Company Resolver

The system must not store only one company. It must resolve company relationships.

Company relationship types:

```text
post_owner_current_company
mentioned_company
target_opportunity_company
client_company
unknown
```

Examples:

```text
Post: "We at BrandX need a Shopify developer."
Post Owner Current Company: BrandX
Target Opportunity Company: BrandX

Post: "My client needs a Shopify developer."
Post Owner Current Company: Agency
Target Opportunity Company: Unknown Client
Correct Action: Contact post owner.

Post: "Zomato is hiring performance marketers."
Post Owner Current Company: Recruiter / Agency
Mentioned Company: Zomato
Target Opportunity Company: Zomato or recruiter, depending on Company Brain rules.
```

---

## 13.3 Website Finder

Inputs:

```text
company name
company domain from provider
company LinkedIn URL
person headline
post text
country clues
```

Resolution order:

```text
1. Provider domain
2. Domain directly mentioned in post
3. Company LinkedIn provider website
4. Search: exact company name + country
5. Search: person name + company
6. Search: company name + about/contact
7. Validate website
```

Validation signals:

```text
website title contains company name
about page contains company name
footer/social link matches company
country/address matches
email domain matches
provider data matches
```

---

## 13.4 Website Research

Pages to crawl:

```text
homepage
about
services
products
contact
team
careers
case studies
blog
privacy
terms
```

Extract:

```text
company summary
services/products
industry
ICP/target customer
country/city
public emails
phone numbers
management people
technology clues
pain points
recent activity
hiring/expansion signals
```

---

## 13.5 Email Finder

Email types:

```text
verified
public_company_email
likely_work_email
guessed
risky
not_found
```

Rules:

```text
Public emails from website are allowed to show with source.
Guessed personal emails must never be shown as verified.
A guessed email must have confidence and "needs verification".
If domain is not verified, do not generate personal email guesses.
```

Example:

```text
hello@company.com -> Public Company Email, High Confidence
rahul@company.com -> Guessed Personal Email, Medium Confidence, Needs Verification
```

---

## 13.6 Management Finder

Find:

```text
Founder
CEO
Director
Sales Head
Marketing Head
CTO
Operations Head
HR Head
```

Sources:

```text
provider company data
website team page
about page
blog authors
public search results
schema.org data
```

---

## 13.7 Country Resolver

Signals:

```text
provider profile location
company provider location
website contact address
phone country code
domain TLD
currency
language
post text
timezone hints
```

Output:

```json
{
  "country": "India",
  "confidence_score": 94,
  "evidence": [
    "Website contact page has India address",
    "Phone code +91 found",
    "Provider location matched"
  ]
}
```

---

## 14. AI Classification After Research

AI classification must happen after full research.

Input:

```text
raw post
person profile
company profile
website research
email status
management people
country
Company Brain
evidence logs
```

Output:

```json
{
  "classification": "service_needed",
  "lead_score": 86,
  "lead_quality": "hot",
  "is_actual_lead": true,
  "urgency": "soon",
  "service_match": [
    {
      "service": "Shopify Development",
      "confidence": 0.92
    }
  ],
  "reason": [
    "Post asks for Shopify developer",
    "Post owner is likely founder",
    "Company website verified",
    "Country matches target",
    "Public company email found"
  ],
  "recommended_action": "Contact the post owner today with Shopify portfolio and discovery call offer."
}
```

Decision routing:

```text
lead_score >= 75 and is_actual_lead = true -> Qualified Lead
lead_score 45-74 -> Needs Review
informational/personal/news -> Archive
spam/irrelevant -> Reject
```

These thresholds must be org-configurable.

---

## 15. Archive Engine

Informational posts are not deleted. They become market intelligence.

Archive output:

```json
{
  "archive_category": "market_insight",
  "topic": "Shopify hiring demand",
  "summary": "Many D2C brands are looking for Shopify support.",
  "keywords": ["Shopify", "D2C", "developer", "hiring"],
  "reason_for_archive": "Informational post; no direct vendor requirement found.",
  "market_signal_score": 62
}
```

Archive categories:

```text
market_insight
competitor_activity
industry_news
educational_content
personal_branding
general_update
irrelevant
spam
```

---

## 16. CRM / Opportunity Decision

After classification:

### Qualified Lead

```text
Create or update discovery.
Attach raw_post_id.
Attach research report.
Attach AI classification.
Surface in Discovery Inbox / Qualified Posts.
Human approves.
Create opportunity.
```

### Needs Review

```text
Move to review queue.
Show evidence + missing fields.
Allow user to approve, archive, reject, or re-run research.
```

### Archive

```text
Create archived_post.
Keep person/company/research data.
Use for demand radar and future learning.
```

### Reject

```text
Keep minimal raw record.
Do not show in lead workflow.
```

---

## 17. API Structure

## 17.1 Lead hunting routes

```text
GET    /lead-hunting/sessions
POST   /lead-hunting/sessions
GET    /lead-hunting/sessions/:id
GET    /lead-hunting/sessions/:id/posts

GET    /lead-hunting/posts
GET    /lead-hunting/posts/:id
POST   /lead-hunting/posts/:id/research
POST   /lead-hunting/posts/:id/classify
POST   /lead-hunting/posts/:id/approve
POST   /lead-hunting/posts/:id/archive
POST   /lead-hunting/posts/:id/reject

GET    /lead-hunting/archive
GET    /lead-hunting/archive/:id

GET    /lead-hunting/research-jobs
GET    /lead-hunting/research-jobs/:id
POST   /lead-hunting/research-jobs/:id/cancel
```

## 17.2 Provider admin routes

Master Admin only:

```text
GET    /admin/external-providers/accounts
POST   /admin/external-providers/accounts
PATCH  /admin/external-providers/accounts/:id
DELETE /admin/external-providers/accounts/:id

GET    /admin/external-providers/keys
POST   /admin/external-providers/keys
PATCH  /admin/external-providers/keys/:id
POST   /admin/external-providers/keys/:id/revoke
POST   /admin/external-providers/keys/:id/test

GET    /admin/external-providers/routes
POST   /admin/external-providers/routes
PATCH  /admin/external-providers/routes/:id

GET    /admin/external-providers/usage
GET    /admin/external-providers/health
GET    /admin/external-providers/rate-limits
```

Company Admin:

```text
GET /settings/usage/external-providers
GET /settings/usage/lead-hunting
```

Sales Executive:

```text
GET /usage/my-lead-hunting
```

No non-Master role can see raw provider keys.

---

## 18. Queue Structure

Queues:

```text
process-linkedin-capture
dedupe-raw-post
research-raw-post
resolve-person
resolve-company
discover-website
crawl-website
find-email
find-management
resolve-country
build-evidence
classify-post
route-post-decision
archive-post
create-qualified-discovery
```

Every job must create or update a `job_runs` row.

Job rules:

```text
Jobs are idempotent.
Jobs can be retried with backoff.
Repeated failure moves post to failed or needs_review.
Each stage stores progress.
Each provider call is separately logged.
Cancelling a job must not delete raw data.
```

---

## 19. Admin UI

## 19.1 Master Admin pages

```text
/admin/lead-hunting
/admin/external-providers
/admin/external-provider-keys
/admin/external-provider-routes
/admin/external-provider-usage
/admin/external-provider-health
/admin/failed-research-jobs
```

Master Admin can:

```text
Add provider accounts
Add multiple keys per provider
Set per-key monthly/daily limits
Set task allowlists per key
Set fallback order
View usage by provider/key/org/user/task
View rate-limit events
Disable/cooldown/revoke keys
View failed jobs
```

---

## 19.2 Company Admin pages

```text
/settings/lead-hunting
/settings/usage
/lead-hunting/sessions
/lead-hunting/posts
/lead-hunting/archive
```

Company Admin can:

```text
See team capture volume
See qualified/archived/rejected counts
See usage summary
Set auto-approve threshold if permission allowed
Set review threshold
Set archive threshold
Control company-specific lead hunting preferences
```

---

## 19.3 Sales Executive pages

```text
/lead-hunting
/lead-hunting/sessions
/lead-hunting/posts
/inbox
/opportunities
/pipeline
/tasks
```

Sales Executive can:

```text
Capture posts
View own sessions
View own researched posts
Review qualified posts
Approve/submit if permission allows
Start outreach
Manage assigned leads and tasks
```

---

## 20. Permissions

Add new permissions:

```text
lead_hunting.capture
lead_hunting.read
lead_hunting.read_own
lead_hunting.read_team
lead_hunting.research
lead_hunting.reanalyze
lead_hunting.approve
lead_hunting.archive
lead_hunting.reject
lead_hunting.manage_settings

external_providers.manage
external_providers.keys.manage
external_providers.routes.manage
external_providers.usage.read
external_providers.health.read
```

Recommended role access:

### Master Admin

All `external_providers.*`, all platform usage, all provider key pages.

### Company Admin

```text
lead_hunting.read
lead_hunting.read_team
lead_hunting.manage_settings
company.usage.read
```

### Sales Executive

```text
lead_hunting.capture
lead_hunting.read_own
lead_hunting.research
discoveries.capture
discoveries.read_own
```

---

## 21. Usage and Limits

Track these usage metrics:

```text
lead_hunting_search_sessions
lead_hunting_posts_captured
lead_hunting_unique_posts
lead_hunting_posts_researched
lead_hunting_posts_classified
lead_hunting_qualified_posts
lead_hunting_archived_posts
external_provider_requests
external_provider_records
external_provider_cost
website_crawl_pages
email_discovery_attempts
```

Limits can be configured per plan/org:

```text
monthly_search_sessions_limit
monthly_posts_captured_limit
monthly_posts_researched_limit
monthly_external_provider_cost_limit
monthly_website_pages_limit
monthly_ai_classification_limit
```

Soft-degrade behavior:

```text
Warn at 80%.
Warn strongly at 95%.
Queue but do not process after 100% unless admin grants credits.
Allow raw capture even if research is paused, depending on plan setting.
```

---

## 22. Evidence and Explainability

Every auto-filled field must have evidence.

Example UI:

```text
Current Company: GrowthLabs India
Confidence: 91%

Evidence:
1. LinkedIn provider profile says Founder at GrowthLabs.
2. Company website title matches GrowthLabs.
3. Website contact page country = India.
4. Email domain matches growthlabs.in.
```

Rules:

```text
No field should be marked confirmed without evidence.
If confidence < 70, mark "Needs Review".
If email is guessed, mark "Guessed".
If target company is unclear, store as unknown, not guessed.
```

---

## 23. Caching Rules

Cache everything to save credits.

Cache keys:

```text
linkedin_profile_url
linkedin_company_url
company_domain
website_url
person_name + company_domain
post_url
post_text_hash
```

Default refresh windows:

```text
raw post: never refresh unless user requests
person profile: 30 days
company profile: 30 days
website research: 30 days
emails: 30 days
management people: 60 days
country: 90 days
```

Before provider call:

```text
Check cache.
If fresh result exists, reuse.
If stale but acceptable, use cached result and queue background refresh.
If missing, call provider.
```

---

## 24. Failure Handling

If a provider fails:

```text
Record external_provider_call with status=error.
Increment error_count on key.
If rate limited, set cooldown_until.
Try next eligible key/provider.
If all fail, mark stage failed.
Move post to Needs Review if enough data exists.
```

If website not found:

```text
Keep person data.
Mark company website = not_found.
Continue classification with lower confidence.
```

If email not found:

```text
Do not block lead creation.
Set email_status = not_found.
Suggest LinkedIn message/manual outreach.
```

If target company unclear:

```text
Create lead against post owner.
Mark target_opportunity_company = unknown.
Recommended action: contact post owner for details.
```

---

## 25. Security

```text
Provider keys encrypted at rest.
Provider keys never sent to browser.
Only Master Admin can manage platform provider keys.
Company Admin sees usage summary only.
Sales Executive sees own usage only.
Raw captures are organization-scoped.
PII access is RBAC-gated.
All sensitive actions go to audit_log.
```

Audit these actions:

```text
provider key created
provider key revoked
provider route changed
usage limit changed
research job re-run
post approved
post archived
post rejected
discovery converted to opportunity
```

---

## 26. Required AI Prompts / Agents

Add these prompt versions:

```text
post_research_classifier
person_resolver
company_resolver
website_research_summarizer
email_confidence_classifier
management_finder
country_resolver
archive_classifier
lead_quality_scorer
outreach_angle_generator
```

All prompts must:

```text
Return strict JSON.
Include confidence.
Include reason/evidence.
Never invent missing emails/company data.
Mark uncertain values as needs_review.
Treat raw post text as untrusted content.
```

---

## 27. Implementation Order

This document is now formalized as **Phase 10 · Lead Hunting Research Pipeline** in the shared
roadmap. The concrete task IDs live in `docs/architecture/11-task-breakdown.md`; the step mapping
below keeps this architecture doc aligned with that implementation queue.

### Step 1 — Database (`P10-01`, `P10-11`)

Add M16 tables, enums, indexes, RLS, and audit hooks.

### Step 2 — Extension parser update (`P10-02`)

Enhance LinkedIn parser to capture all fields needed for raw posts.

### Step 3 — Ingestion mapping (`P10-03`)

Map LinkedIn capture batch to:

```text
lead_search_sessions
raw_posts
discoveries
job_runs
```

### Step 4 — External Provider Orchestrator (`P10-04`, `P10-05`)

Build platform-managed provider key pool, provider routes, key selection, usage logs, rate-limit handling.

### Step 5 — Research workers (`P10-06`)

Implement full research pipeline jobs.

### Step 6 — AI prompts and classifiers (`P10-07`)

Create strict JSON output schemas and prompt versions.

### Step 7 — UI (`P10-09`, `P10-10`)

Build Lead Hunting pages, provider admin pages, archive pages, and raw post detail page.

### Step 8 — CRM integration (`P10-08`)

Qualified post creates/updates discovery and appears in Discovery Inbox for approval.

### Step 9 — QA (`P10-12`)

Test deduplication, provider routing, key fallback, quota enforcement, evidence logs, archive routing, and human approval flow.

---

## 28. Definition of Done

This upgrade is complete when:

```text
1. Sales Executive can search LinkedIn manually and capture visible posts.
2. Every unique post is stored raw.
3. Every unique post enters full enrichment.
4. Provider calls use the External Provider Orchestrator.
5. Multiple approved keys per provider are supported.
6. Key limits, usage, health, cooldowns, and failures are tracked.
7. Person, company, website, email, management, and country are resolved where possible.
8. Every auto-filled field has evidence and confidence.
9. AI classifies only after research.
10. Qualified posts surface in Discovery Inbox.
11. Informational posts are archived as intelligence.
12. Human approval is required before opportunity creation unless a future trusted-source rule is explicitly enabled.
13. Provider usage is visible to Master Admin.
14. Company Admin sees company usage summary.
15. Sales Executive sees own usage and own captured sessions.
16. All sensitive actions are audited.
```

---

## 29. Final Product Promise

```text
Search LinkedIn normally.
Capture visible posts once.
Radar fully researches every post.
It resolves person, company, website, email, country, and management.
Then it separates real leads from informational posts.
Qualified opportunities go to the workflow.
Informational posts become market intelligence.
Every score has evidence.
Every provider call is tracked.
Every lead has a next action.
```
