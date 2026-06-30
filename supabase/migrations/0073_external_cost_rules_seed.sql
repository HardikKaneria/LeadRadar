-- Phase 10 · External Provider Cost Intelligence — Default seed data (P10-14).
-- Runs in a separate transaction from 0072 because PostgreSQL 12+ forbids using
-- new enum values ('successful_record', 'provider_reported', etc.) in the same
-- transaction where they were added via ALTER TYPE ... ADD VALUE.

-- 1H. Seed default external_cost_rules for known providers.

-- Bright Data: LinkedIn profile lookup (1 credit per successful record)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, dataset_key, unit_type, billing_event, units_per_successful_record, free_tier_eligible, priority, formula_json, is_active)
values (
  'bright_data', 'Bright Data LinkedIn People Profile', 'task_type', 'linkedin_profile_lookup',
  'linkedin_people_profile', 'successful_record', 'after_success',
  1, true, 10,
  '{"billing":"successful_record","unit_type":"successful_record","units_per_successful_record":1,"bill_failed_requests":false,"prefer_provider_reported_units":true}'::jsonb,
  true
)
on conflict do nothing;

-- Bright Data: LinkedIn post lookup (2 credits per successful post)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, dataset_key, unit_type, billing_event, units_per_successful_record, free_tier_eligible, priority, formula_json, is_active)
values (
  'bright_data', 'Bright Data LinkedIn Posts', 'task_type', 'linkedin_post_lookup',
  'linkedin_posts', 'successful_record', 'after_success',
  2, true, 10,
  '{"billing":"successful_record","unit_type":"successful_record","units_per_successful_record":2,"bill_failed_requests":false,"prefer_provider_reported_units":true}'::jsonb,
  true
)
on conflict do nothing;

-- Bright Data: LinkedIn company lookup (1 credit per successful record)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, dataset_key, unit_type, billing_event, units_per_successful_record, free_tier_eligible, priority, formula_json, is_active)
values (
  'bright_data', 'Bright Data LinkedIn Company', 'task_type', 'linkedin_company_lookup',
  'linkedin_company', 'successful_record', 'after_success',
  1, true, 10,
  '{"billing":"successful_record","unit_type":"successful_record","units_per_successful_record":1,"bill_failed_requests":false,"prefer_provider_reported_units":true}'::jsonb,
  true
)
on conflict do nothing;

-- Firecrawl: website crawl (1 credit per page)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, unit_type, billing_event, units_per_page, free_tier_eligible, priority, formula_json, is_active)
values (
  'firecrawl', 'Firecrawl Website Crawl', 'task_type', 'website_crawl',
  'page', 'after_success',
  1, true, 10,
  '{"billing":"page","unit_type":"page","units_per_page":1,"prefer_provider_reported_units":true}'::jsonb,
  true
)
on conflict do nothing;

-- Tavily: public search (1 credit per request)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, unit_type, billing_event, units_per_request, free_tier_eligible, priority, formula_json, is_active)
values (
  'tavily', 'Tavily Search', 'task_type', 'public_search',
  'credit', 'after_success',
  1, true, 10,
  '{"billing":"request_or_result","unit_type":"credit","units_per_request":1,"prefer_provider_reported_units":true}'::jsonb,
  true
)
on conflict do nothing;

-- Apify: LinkedIn profile lookup (provider-reported cost via usageUsd field)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, actor_key, unit_type, billing_event, free_tier_eligible, priority, formula_json, is_active)
values (
  'apify', 'Apify LinkedIn Profile Actor', 'task_type', 'linkedin_profile_lookup',
  'apify.linkedin_profile_actor', 'provider_reported', 'after_provider_report',
  true, 10,
  '{"billing":"provider_reported_cost","unit_type":"usd_credit","prefer_provider_reported_cost":true,"fallback_units_per_run":0.05}'::jsonb,
  true
)
on conflict do nothing;

-- ScraperAPI: blocked website fetch (1 credit base, multipliers for options)
insert into public.external_cost_rules (provider, rule_name, rule_scope, task_type, unit_type, billing_event, units_per_request, free_tier_eligible, priority, formula_json, is_active)
values (
  'scraperapi', 'ScraperAPI Blocked Website Fetch', 'task_type', 'blocked_website_fetch',
  'api_credit', 'after_success',
  1, true, 10,
  '{"billing":"request","unit_type":"api_credit","units_per_request":1,"multipliers":{"render_js":10,"premium_proxy":10,"screenshot":5,"country_targeting":2},"prefer_provider_reported_units":false}'::jsonb,
  true
)
on conflict do nothing;

-- 1I. Seed ScraperAPI option cost multipliers.
insert into public.external_option_cost_multipliers (provider, option_key, option_value, multiplier, applies_to_task_types, is_active)
values
  ('scraperapi', 'render_js', 'true', 10, array['blocked_website_fetch','website_crawl'], true),
  ('scraperapi', 'premium_proxy', 'true', 10, array['blocked_website_fetch','website_crawl'], true),
  ('scraperapi', 'screenshot', 'true', 5, array['blocked_website_fetch','website_crawl'], true),
  ('scraperapi', 'country_targeting', 'true', 2, array['blocked_website_fetch','website_crawl'], true)
on conflict do nothing;

-- 1J. Seed endpoint catalog.
insert into public.external_endpoint_catalog (provider, endpoint_key, display_name, task_types, dataset_key, actor_key, default_unit_type, notes, is_active)
values
  ('bright_data', 'bright_data.linkedin_posts_dataset', 'Bright Data LinkedIn Posts', array['linkedin_post_lookup'], 'linkedin_posts', null, 'successful_record', 'Dataset: linkedin_posts. 2 credits per successful post.', true),
  ('bright_data', 'bright_data.linkedin_people_profile_dataset', 'Bright Data LinkedIn People Profile', array['linkedin_profile_lookup'], 'linkedin_people_profile', null, 'successful_record', 'Dataset: linkedin_people_profile. 1 credit per successful record.', true),
  ('bright_data', 'bright_data.linkedin_company_dataset', 'Bright Data LinkedIn Company', array['linkedin_company_lookup'], 'linkedin_company', null, 'successful_record', 'Dataset: linkedin_company. 1 credit per successful record.', true),
  ('apify', 'apify.linkedin_profile_actor', 'Apify LinkedIn Profile Scraper', array['linkedin_profile_lookup'], null, 'linkedin_profile_actor', 'provider_reported', 'Apify actor. Cost is provider-reported (usageUsd field).', true),
  ('apify', 'apify.linkedin_company_actor', 'Apify LinkedIn Company Scraper', array['linkedin_company_lookup'], null, 'linkedin_company_actor', 'provider_reported', 'Apify actor. Cost is provider-reported.', true),
  ('firecrawl', 'firecrawl.scrape', 'Firecrawl Scrape', array['website_crawl','website_discovery'], null, null, 'credit', 'Single page scrape. 1 credit per page.', true),
  ('firecrawl', 'firecrawl.crawl', 'Firecrawl Crawl', array['website_crawl'], null, null, 'page', 'Multi-page crawl. 1 credit per page crawled.', true),
  ('tavily', 'tavily.search', 'Tavily Search', array['public_search'], null, null, 'credit', 'Web search. 1 credit per request.', true),
  ('serpapi', 'serpapi.google_search', 'SerpApi Google Search', array['public_search'], null, null, 'search', '1 search per request.', true),
  ('scraperapi', 'scraperapi.fetch', 'ScraperAPI Fetch', array['website_crawl','blocked_website_fetch'], null, null, 'api_credit', '1 credit base, multipliers for render_js/premium_proxy/screenshot/country_targeting.', true)
on conflict (provider, endpoint_key) do nothing;
