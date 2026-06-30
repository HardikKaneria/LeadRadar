import type { ExtensionBatchJobPayload } from '@radar/contracts';
import { normalizeRawPostCapture } from './lead-hunting-capture';

function makePayload(): ExtensionBatchJobPayload {
  return {
    batchId: 'batch-1',
    source: 'linkedin',
    capturedUrl: 'https://www.linkedin.com/search/results/content/',
    capturedAt: '2026-06-29T10:00:00.000Z',
    captureMode: 'visible_posts',
    searchQuery: 'shopify hiring agency',
    parserVersion: 'linkedin-v2',
    tokenId: 'token-1',
    capturedBy: 'user-1',
    items: [],
  };
}

describe('normalizeRawPostCapture', () => {
  it('builds stable fingerprints from the LinkedIn raw-post fields', () => {
    const first = normalizeRawPostCapture(
      makePayload(),
      {
        postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123/?tracking=abc',
        postText: 'We need a Shopify development partner for a 3 month build.',
        postOwnerName: 'Riya Patel',
        postOwnerProfileUrl: 'https://www.linkedin.com/in/riya-patel/',
        visibleCompanyName: 'Growth Labs',
        postDate: '2026-06-28',
        raw: {},
      },
      1,
    );
    const second = normalizeRawPostCapture(
      makePayload(),
      {
        postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:123/',
        postText: 'We need a Shopify development partner for a 3 month build.',
        postOwnerName: 'Riya Patel',
        postOwnerProfileUrl: 'https://www.linkedin.com/in/riya-patel',
        visibleCompanyName: 'Growth Labs',
        postDate: '2026-06-28',
        raw: {},
      },
      1,
    );

    expect(first.dedupHash).toBe(second.dedupHash);
    expect(first.fingerprints.map((fingerprint) => fingerprint.type)).toEqual([
      'post_url',
      'post_text_hash',
      'owner_profile_text',
      'owner_name_date_excerpt',
      'company_text',
    ]);
    expect(first.postDate).toBe('2026-06-28T00:00:00.000Z');
  });

  it('falls back to a serialized dedup hash when no fingerprint fields exist', () => {
    const normalized = normalizeRawPostCapture(
      makePayload(),
      {
        raw: { empty: true },
      },
      3,
    );

    expect(normalized.fingerprints).toEqual([]);
    expect(normalized.dedupHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
