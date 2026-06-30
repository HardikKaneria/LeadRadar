/**
 * @jest-environment jsdom
 *
 * P2-12 QA — extension parser snapshots + the visible-only capture guarantee.
 * jsdom returns a zero-size getBoundingClientRect by default, so we stub it to reflect
 * inline display/visibility — the only thing isVisible() inspects beyond computed style.
 */
import { compactItems, isVisible, textOf, hrefOf, visibleElements } from './helpers';
import { parseGeneric } from './generic';
import { parseLinkedIn } from './linkedin';
import type { ExtensionCaptureItem } from '../lib/types';

beforeAll(() => {
  if (!Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent ?? '';
      },
    });
  }

  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement): DOMRect {
      const hidden = this.style.display === 'none' || this.style.visibility === 'hidden';
      const width = hidden ? 0 : Number(this.dataset.width ?? 120);
      const height = hidden ? 0 : Number(this.dataset.height ?? 24);
      const top = Number(this.dataset.top ?? 0);
      const left = Number(this.dataset.left ?? 0);
      return {
        width,
        height,
        top,
        left,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    });
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState({}, '', 'http://localhost/');
});

describe('compactItems', () => {
  it('drops items with no usable signal and keeps populated ones', () => {
    const items: ExtensionCaptureItem[] = [
      { raw: {} },
      { title: 'Real lead', raw: {} },
      { email: 'a@b.com', raw: {} },
    ];
    expect(compactItems(items)).toHaveLength(2);
  });
});

describe('textOf / hrefOf', () => {
  it('reads trimmed text and resolves anchor hrefs', () => {
    document.body.innerHTML = '<div id="card"><span class="t">  Hello  </span><a class="l" href="/jobs/1">go</a></div>';
    const card = document.getElementById('card')!;
    expect(textOf(card, '.t')).toBe('Hello');
    expect(hrefOf(card, '.l')).toBe('http://localhost/jobs/1');
    expect(textOf(card, '.missing')).toBeUndefined();
  });
});

describe('visible-only capture guarantee (isVisible / visibleElements)', () => {
  it('excludes display:none and visibility:hidden elements', () => {
    document.body.innerHTML = `
      <div class="card" id="v">visible</div>
      <div class="card" id="hidden-display" style="display:none">hidden</div>
      <div class="card" id="hidden-vis" style="visibility:hidden">hidden</div>
    `;
    expect(isVisible(document.getElementById('v'))).toBe(true);
    expect(isVisible(document.getElementById('hidden-display'))).toBe(false);
    expect(isVisible(document.getElementById('hidden-vis'))).toBe(false);

    const visible = visibleElements(['.card']);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe('v');
  });

  it('returns false for null / non-HTML nodes', () => {
    expect(isVisible(null)).toBe(false);
  });
});

describe('parseGeneric (website fallback parser)', () => {
  it('captures the visible heading + a substantial paragraph as one item', () => {
    document.title = 'Acme — Hire us';
    document.body.innerHTML = `
      <h1>We build conversion-focused websites</h1>
      <p>short</p>
      <p>We are a product studio that helps founder-led teams ship faster without hiring in-house.</p>
    `;
    const result = parseGeneric();
    expect(result.source).toBe('website');
    expect(result.parserVersion).toBe('generic-v1');
    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.title).toBe('We build conversion-focused websites');
    expect(item.description).toContain('product studio');
    expect(item.website).toBe('http://localhost/');
    expect(item.raw.site).toBe('generic');
  });

  it('falls back to the document title when there is no heading', () => {
    document.title = 'Just a title';
    document.body.innerHTML = '<p>tiny</p>';
    expect(parseGeneric().items[0]!.title).toBe('Just a title');
  });
});

describe('parseLinkedIn (P10-02 visible-post capture)', () => {
  it('captures only viewport-visible posts and emits the richer raw-post fields', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    window.history.replaceState(
      {},
      '',
      'https://www.linkedin.com/search/results/content/?keywords=Shopify%20developer%20hiring',
    );

    document.body.innerHTML = `
      <div role="listitem" id="visible" data-top="32" data-height="320">
        <div>
          <a href="https://www.linkedin.com/in/rahul-shah">
            <span aria-label="Rahul Shah 3rd+">Rahul Shah</span>
          </a>
        </div>
        <div><p><span>Founder at GrowthLabs</span></p></div>
        <a href="https://www.linkedin.com/company/growthlabs">GrowthLabs</a>
        <a href="https://www.linkedin.com/feed/update/urn:li:activity:1">
          <time datetime="2026-06-28T09:00:00.000Z">Jun 28, 2026</time>
        </a>
        <div data-testid="expandable-text-box">
          Looking for a Shopify developer for our D2C brand in India. Experience with Shopify Plus,
          checkout extensions, and conversion-focused frontends is important for this engagement.
        </div>
        <button aria-label="32 reactions">React</button>
        <button aria-label="14 comments">Comment</button>
        <button aria-label="2 reposts">Repost</button>
      </div>
      <div role="listitem" id="offscreen" data-top="1200" data-height="320">
        <div>
          <a href="https://www.linkedin.com/in/offscreen-person">
            <span aria-label="Offscreen Person 3rd+">Offscreen Person</span>
          </a>
        </div>
        <div><p><span>Hidden from viewport</span></p></div>
        <div data-testid="expandable-text-box">
          This should never be captured because it is below the viewport and not currently visible to the operator.
        </div>
      </div>
    `;

    const result = parseLinkedIn();
    expect(result.source).toBe('linkedin');
    expect(result.captureMode).toBe('visible_posts');
    expect(result.searchQuery).toBe('Shopify developer hiring');
    expect(result.parserVersion).toBe('linkedin-visible-posts-v2');
    expect(result.items).toHaveLength(1);

    const item = result.items[0]!;
    expect(item.postUrl).toBe('https://www.linkedin.com/feed/update/urn:li:activity:1');
    expect(item.postText).toContain('Shopify developer');
    expect(item.postOwnerName).toBe('Rahul Shah');
    expect(item.postOwnerHeadline).toBe('Founder at GrowthLabs');
    expect(item.postOwnerProfileUrl).toBe('https://www.linkedin.com/in/rahul-shah');
    expect(item.visibleCompanyName).toBe('GrowthLabs');
    expect(item.visibleCompanyUrl).toBe('https://www.linkedin.com/company/growthlabs');
    expect(item.postDate).toBe('2026-06-28');
    expect(item.reactionCount).toBe(32);
    expect(item.commentCount).toBe(14);
    expect(item.repostCount).toBe(2);
    expect(item.url).toBe(item.postUrl);
    expect(item.contactName).toBe('Rahul Shah');
    expect(item.companyName).toBe('GrowthLabs');
    expect(item.raw.captureMode).toBe('visible_posts');
  });
});
