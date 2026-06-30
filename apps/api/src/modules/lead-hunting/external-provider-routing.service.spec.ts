import type { ServiceClient } from '@radar/supabase';
import {
  ExternalProviderRoutingService,
  buildExternalProviderRouteMap,
  mapExternalProviderRouteRow,
} from './external-provider-routing.service';
import type { ExternalProviderRouteRow } from './external-provider.types';

function makeRouteRow(overrides: Partial<ExternalProviderRouteRow> = {}): ExternalProviderRouteRow {
  return {
    id: 'route-1',
    task_type: 'linkedin_post_lookup',
    primary_provider: 'bright_data',
    fallback_provider: 'apify',
    fallback_2_provider: 'manual',
    fallback_3_provider: null,
    allow_manual_fallback: true,
    requires_browser: false,
    requires_json: true,
    timeout_ms: 45000,
    max_attempts: 3,
    is_active: true,
    notes: 'Manual fallback allowed.',
    created_at: '2026-06-29T00:00:00.000Z',
    updated_at: '2026-06-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapExternalProviderRouteRow', () => {
  it('maps the DB row to the orchestrator route shape', () => {
    expect(mapExternalProviderRouteRow(makeRouteRow())).toEqual({
      id: 'route-1',
      taskType: 'linkedin_post_lookup',
      attempts: ['bright_data', 'apify', 'manual'],
      allowManualFallback: true,
      requiresBrowser: false,
      requiresJson: true,
      timeoutMs: 45000,
      maxAttempts: 3,
      notes: 'Manual fallback allowed.',
    });
  });
});

describe('buildExternalProviderRouteMap', () => {
  it('indexes rows by task type', () => {
    const routes = buildExternalProviderRouteMap([
      makeRouteRow(),
      makeRouteRow({
        id: 'route-2',
        task_type: 'website_crawl',
        primary_provider: 'firecrawl',
        fallback_provider: 'scraperapi',
        fallback_2_provider: 'internal',
        fallback_3_provider: 'manual',
      }),
    ]);

    expect(Object.keys(routes).sort()).toEqual(['linkedin_post_lookup', 'website_crawl']);
    expect(routes.website_crawl).toMatchObject({
      taskType: 'website_crawl',
      attempts: ['firecrawl', 'scraperapi', 'internal', 'manual'],
    });
  });
});

describe('ExternalProviderRoutingService.loadActiveRoutes', () => {
  it('reads active route rows from Supabase', async () => {
    const eq = jest.fn().mockResolvedValue({ data: [makeRouteRow()], error: null });
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const supabase = { from } as unknown as ServiceClient;

    const service = new ExternalProviderRoutingService(supabase);
    const routes = await service.loadActiveRoutes();

    expect(from).toHaveBeenCalledWith('external_provider_routes');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(routes.linkedin_post_lookup).toMatchObject({
      taskType: 'linkedin_post_lookup',
      attempts: ['bright_data', 'apify', 'manual'],
    });
  });
});
