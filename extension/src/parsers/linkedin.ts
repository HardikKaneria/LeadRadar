import type { ExtensionCaptureItem } from '../lib/types';
import { scoreRelevance } from '../lib/relevance';
import type { ParserResult } from './helpers';
import { compactItems, isVisible } from './helpers';

function pageType(): 'posts' | 'people' | 'jobs' | 'feed' | 'other' {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path.includes('/search/results/content')) return 'posts';
  if (params.get('resultType') === 'CONTENT') return 'posts';
  if (path.includes('/search/results/people')) return 'people';
  if (path.includes('/search/results/jobs') || path.includes('/jobs/')) return 'jobs';
  if (path === '/feed/' || path === '/feed') return 'feed';
  if (path.includes('/search/results/')) return 'posts';
  return 'other';
}

function pick(root: HTMLElement, ...sels: string[]): string | undefined {
  for (const sel of sels) {
    try {
      const el = root.querySelector(sel);
      const text = normalizeSpaces(el?.textContent);
      if (text) return text;
    } catch {
      // Ignore invalid selectors from LinkedIn's unstable DOM.
    }
  }
  return undefined;
}

function href(root: HTMLElement, ...sels: string[]): string | undefined {
  for (const sel of sels) {
    try {
      const el = root.querySelector<HTMLAnchorElement>(sel);
      if (el?.href) return stripUrlQuery(el.href);
    } catch {
      // Ignore invalid selectors from LinkedIn's unstable DOM.
    }
  }
  return undefined;
}

function normalizeSpaces(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function stripUrlQuery(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.split('?')[0];
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLinkedInDateValue(value: string | undefined): string | undefined {
  const raw = normalizeSpaces(value);
  if (!raw) return undefined;

  const cleaned = raw
    .replace(/·/g, ' ')
    .replace(/\bEdited\b/gi, ' ')
    .replace(/\bago\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const relative = cleaned.match(/(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\b/i);
  if (relative) {
    const amount = Number.parseInt(relative[1] ?? '', 10);
    const unit = (relative[2] ?? '').toLowerCase();
    if (!Number.isNaN(amount)) {
      const date = new Date();
      if (['m', 'min', 'mins', 'minute', 'minutes'].includes(unit)) date.setMinutes(date.getMinutes() - amount);
      else if (['h', 'hr', 'hrs', 'hour', 'hours'].includes(unit)) date.setHours(date.getHours() - amount);
      else if (['d', 'day', 'days'].includes(unit)) date.setDate(date.getDate() - amount);
      else if (['w', 'wk', 'wks', 'week', 'weeks'].includes(unit)) date.setDate(date.getDate() - amount * 7);
      else if (['mo', 'mos', 'month', 'months'].includes(unit)) date.setMonth(date.getMonth() - amount);
      else if (['y', 'yr', 'yrs', 'year', 'years'].includes(unit)) date.setFullYear(date.getFullYear() - amount);
      return formatDateOnly(date);
    }
  }

  const absolute = cleaned.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?:\s+\d{4})?)/i);
  if (absolute) {
    const candidate = absolute[1] ?? '';
    const withYear = /\d{4}/.test(candidate) ? candidate : `${candidate}, ${new Date().getFullYear()}`;
    const parsed = new Date(withYear);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateOnly(parsed);
    }
  }

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateOnly(parsed);
  }

  return undefined;
}

function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < viewportHeight && rect.left < viewportWidth;
}

function findPostCards(): HTMLElement[] {
  const seen = new Set<HTMLElement>();

  const activityLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/feed/update/urn:li:activity:"], a[href*="urn%3Ali%3Aactivity%3A"]',
  );

  for (const link of Array.from(activityLinks)) {
    let el: HTMLElement | null = link.parentElement;
    for (let depth = 0; depth < 15 && el; depth++) {
      const cls = (el.className ?? '').toString();
      const tag = el.tagName?.toLowerCase();
      if (
        tag === 'li' ||
        el.getAttribute('role') === 'listitem' ||
        cls.includes('occludable-update') ||
        cls.includes('feed-shared-update') ||
        cls.includes('reusable-search__result') ||
        cls.includes('search-result__wrapper') ||
        cls.includes('update-components-') ||
        el.hasAttribute('data-urn') ||
        el.hasAttribute('data-id')
      ) {
        seen.add(el);
        break;
      }
      el = el.parentElement;
    }
  }

  if (seen.size === 0) {
    const directSelectors = [
      '.occludable-update',
      '.feed-shared-update-v2',
      '.reusable-search__result-container',
      '[data-urn*="activity:"]',
      '[data-chameleon-result-urn]',
      '.artdeco-list__item.reusable-search__result-container',
    ];
    for (const sel of directSelectors) {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => seen.add(el));
      } catch {
        // Ignore invalid selectors from LinkedIn's unstable DOM.
      }
    }

    if (seen.size === 0) {
      document.querySelectorAll<HTMLElement>('div[role="listitem"]').forEach((el) => {
        if (el.innerText.trim().length > 80 && el.querySelector('a[href*="/in/"], a[href*="/company/"]')) {
          seen.add(el);
        }
      });
    }
  }

  if (seen.size === 0) {
    const containerSelectors = [
      '.scaffold-finite-scroll__content li',
      '#main ul > li',
      '[role="main"] ul > li',
      '[role="list"] > [role="listitem"]',
    ];
    for (const sel of containerSelectors) {
      try {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (el.innerText.trim().length > 100) seen.add(el);
        });
      } catch {
        // Ignore invalid selectors from LinkedIn's unstable DOM.
      }
    }
  }

  return [...seen];
}

function filterVisibleCards(cards: HTMLElement[]): HTMLElement[] {
  return cards.filter((card) => isVisible(card) && isInViewport(card));
}

function extractSearchQuery(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  for (const key of ['keywords', 'query']) {
    const value = params.get(key);
    if (value) return normalizeSpaces(decodeURIComponent(value.replace(/\+/g, ' ')));
  }

  const input = document.querySelector<HTMLInputElement>(
    'input[role="combobox"], input[aria-label*="Search"], input[placeholder*="Search"]',
  );
  return normalizeSpaces(input?.value);
}

function extractAuthor(card: HTMLElement): {
  name?: string;
  headline?: string;
  profileUrl?: string;
  company?: string;
  companyUrl?: string;
} {
  const profileLink =
    card.querySelector<HTMLAnchorElement>(
      'a[href*="linkedin.com/in/"], a[href*="/in/"][class*="actor"], a[href*="/in/"][class*="image"], a[href*="/in/"][class*="name"]',
    ) ?? card.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
  const profileUrl = stripUrlQuery(profileLink?.href);

  let name: string | undefined;
  const actorLabelEl = profileLink?.querySelector('[aria-label]');
  if (actorLabelEl) {
    let raw = actorLabelEl.getAttribute('aria-label') ?? '';
    raw = raw
      .replace(/\s*(Premium Profile|Verified Profile|Open to work)\s*/gi, ' ')
      .replace(/\s*[•·]?\s*(1st\+?|2nd\+?|3rd\+?|Fellow)\s*$/i, '')
      .trim();
    if (raw) name = raw;
  }

  if (!name) {
    name = pick(
      card,
      '.update-components-actor__name span[aria-hidden="true"]',
      '.update-components-actor__name span:not(.visually-hidden)',
      '.update-components-actor__name',
      '.feed-shared-actor__name span[aria-hidden="true"]',
      '.feed-shared-actor__name',
      '.artdeco-entity-lockup__title span[aria-hidden="true"]',
      '.artdeco-entity-lockup__title',
      '[data-anonymize="person-name"]',
      'span.hoverable-link-text',
    );
  }

  if (!name && profileLink) {
    name = normalizeSpaces(
      profileLink.textContent
        ?.replace(/\s*(Premium Profile|Verified Profile|Open to work)\s*/gi, ' ')
        .replace(/\s*[•·]?\s*(1st\+?|2nd\+?|3rd\+?)\s*$/, ''),
    );
  }

  let headline = pick(
    card,
    '.update-components-actor__description span[aria-hidden="true"]',
    '.update-components-actor__description',
    '.feed-shared-actor__description span[aria-hidden="true"]',
    '.feed-shared-actor__description',
    '.artdeco-entity-lockup__subtitle span[aria-hidden="true"]',
    '.artdeco-entity-lockup__subtitle',
    '[data-anonymize="headline"]',
  );

  if (!headline && profileLink) {
    const degreeRe = /^\s*[•·]\s*(1st|2nd|3rd)/i;
    const timeRe = /^\d+\s*(m|min|h|d|w|mo|y)\b/i;
    let el: HTMLElement | null = profileLink.parentElement;
    for (let depth = 0; depth < 8 && el && !headline; depth++) {
      const parent = el.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children) as HTMLElement[]) {
        if (sibling === el || sibling.contains(profileLink)) continue;
        const spans = Array.from(sibling.querySelectorAll<HTMLElement>('p span, p, div span'));
        for (const span of spans) {
          const text = normalizeSpaces(span.textContent);
          if (!text || text.length < 8) continue;
          if (degreeRe.test(text) || timeRe.test(text)) continue;
          if (text === name) continue;
          headline = text;
          break;
        }
        if (headline) break;
      }
      el = parent;
    }
  }

  let company = pick(
    card,
    '.update-components-actor__supplementary-actor-info span[aria-hidden="true"]',
    '.update-components-actor__supplementary-actor-info',
    '[data-anonymize="company-name"]',
  );
  const companyUrl = href(card, 'a[href*="/company/"]');

  if (!company && companyUrl) {
    const companyLink = card.querySelector<HTMLAnchorElement>('a[href*="/company/"]');
    company = normalizeSpaces(companyLink?.textContent);
  }

  return { name, headline, profileUrl, company, companyUrl };
}

function extractPostText(card: HTMLElement): string | undefined {
  const textEl =
    card.querySelector('[data-testid="expandable-text-box"]') ??
    card.querySelector('p[componentkey*="feed-commentary"] span') ??
    card.querySelector('.update-components-text span[dir]') ??
    card.querySelector('.update-components-text .break-words') ??
    card.querySelector('.update-components-text') ??
    card.querySelector('.feed-shared-text .break-words') ??
    card.querySelector('.feed-shared-text') ??
    card.querySelector('.feed-shared-inline-show-more-text') ??
    card.querySelector('.attributed-text-segment-list__content') ??
    card.querySelector('[data-test-id="main-feed-activity-card__commentary"]');

  if (textEl) {
    return normalizeSpaces(textEl.textContent);
  }

  const raw = card.innerText.slice(0, 4000);
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const engagementPattern = /^(like|comment|share|send|react|\d[\d,.]*\s*(reaction|comment|repost|view))/i;
  const bodyLines: string[] = [];
  let skipped = 0;
  for (const line of lines) {
    if (skipped < 3 && line.length < 120) {
      skipped += 1;
      continue;
    }
    if (engagementPattern.test(line) && bodyLines.length > 0) break;
    if (line.length < 3) continue;
    bodyLines.push(line);
  }
  return normalizeSpaces(bodyLines.join('\n'));
}

function extractPostUrl(card: HTMLElement, profileUrl?: string): string | undefined {
  return (
    href(card, 'a[href*="/feed/update/urn:li:activity:"]') ??
    href(card, 'a[href*="/feed/update/"]') ??
    href(card, 'a[href*="/posts/"]') ??
    profileUrl
  );
}

function collectDateCandidates(card: HTMLElement): string[] {
  const candidates = new Set<string>();
  const timeEl = card.querySelector('time');
  const datetime = normalizeSpaces(timeEl?.getAttribute('datetime'));
  if (datetime) candidates.add(datetime);
  const timeText = normalizeSpaces(timeEl?.textContent);
  if (timeText) candidates.add(timeText);

  const selectors = [
    'a[href*="/feed/update/"] time',
    'a[href*="/feed/update/"] span[aria-hidden="true"]',
    '.update-components-actor__sub-description span[aria-hidden="true"]',
    '.feed-shared-actor__sub-description span[aria-hidden="true"]',
  ];
  for (const sel of selectors) {
    try {
      card.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const text = normalizeSpaces(el.textContent);
        if (text) candidates.add(text);
      });
    } catch {
      // Ignore invalid selectors from LinkedIn's unstable DOM.
    }
  }

  return [...candidates];
}

function extractPostDateMeta(card: HTMLElement): { postDate?: string; rawDateText?: string } {
  for (const candidate of collectDateCandidates(card)) {
    const postDate = parseLinkedInDateValue(candidate);
    if (postDate) return { postDate, rawDateText: candidate };
  }
  return {};
}

function collectMetricText(card: HTMLElement): string {
  const fragments = new Set<string>();
  fragments.add(card.innerText);
  card.querySelectorAll<HTMLElement>('button[aria-label], span[aria-label], div[aria-label], a[aria-label]').forEach((el) => {
    const label = normalizeSpaces(el.getAttribute('aria-label'));
    if (label) fragments.add(label);
  });
  return [...fragments].join('\n');
}

function parseMetricValue(haystack: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    const raw = match?.[1];
    if (!raw) continue;
    const value = Number.parseInt(raw.replaceAll(',', ''), 10);
    if (!Number.isNaN(value)) return value;
  }
  return undefined;
}

function extractMediaText(card: HTMLElement, authorName?: string): string | undefined {
  const fragments = new Set<string>();
  const selectors = [
    'img[alt]',
    '.update-components-article__title',
    '.update-components-article__description',
    '.feed-shared-article__title',
    '.feed-shared-article__description',
    '[data-test-id="feed-images-content__caption"]',
  ];

  for (const sel of selectors) {
    try {
      card.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const text =
          normalizeSpaces(el.getAttribute('alt')) ??
          normalizeSpaces(el.textContent);
        if (!text || text === authorName || text.toLowerCase() === 'profile photo') return;
        fragments.add(text);
      });
    } catch {
      // Ignore invalid selectors from LinkedIn's unstable DOM.
    }
  }

  const combined = [...fragments].join(' | ');
  return combined.length > 0 ? combined.slice(0, 4000) : undefined;
}

function buildTitle(postText: string | undefined, name: string | undefined, company: string | undefined): string {
  const firstLine = postText
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 20);
  if (firstLine) return firstLine;
  if (name && company) return `${name} at ${company}`;
  return name ?? company ?? 'LinkedIn Post';
}

function parsePosts(): ParserResult {
  const cards = filterVisibleCards(findPostCards());
  const searchQuery = extractSearchQuery();
  console.info('[Radar/linkedin] visible post cards found:', cards.length, window.location.href);

  const items = compactItems(
    cards.slice(0, 60).map((card): ExtensionCaptureItem => {
      const { name, headline, profileUrl, company, companyUrl } = extractAuthor(card);
      const postText = extractPostText(card);
      const postUrl = extractPostUrl(card, profileUrl);
      const { postDate, rawDateText } = extractPostDateMeta(card);
      const metricText = collectMetricText(card);
      const reactionCount = parseMetricValue(metricText, [
        /(\d[\d,]*)\s+(?:reactions?|likes?)/i,
        /(\d[\d,]*)\s+(?:people\s+)?reacted/i,
      ]);
      const commentCount = parseMetricValue(metricText, [/(\d[\d,]*)\s+comments?/i]);
      const repostCount = parseMetricValue(metricText, [/(\d[\d,]*)\s+(?:reposts?|shares?)/i]);
      const mediaText = extractMediaText(card, name);
      const budgetMatch = postText?.match(/\$[\d,]+(?:\s*\/\s*(?:hr|hour|month|mo|week|day|yr|year))?|\d[\d,]+\s*(?:USD|EUR|GBP|INR)/i);

      const fullText = [name, headline, company, postText, mediaText].filter(Boolean).join(' ');
      const { tier, score, matched } = scoreRelevance(fullText);
      const title = buildTitle(postText, name, company);
      const rect = card.getBoundingClientRect();

      return {
        title: title.slice(0, 160),
        description: postText?.slice(0, 2000).trim(),
        companyName: company,
        contactName: name,
        url: postUrl,
        budgetHint: budgetMatch?.[0],
        postUrl,
        postText: postText?.slice(0, 10000).trim(),
        postOwnerName: name,
        postOwnerHeadline: headline,
        postOwnerProfileUrl: profileUrl,
        visibleCompanyName: company,
        visibleCompanyUrl: companyUrl,
        postDate,
        reactionCount,
        commentCount,
        repostCount,
        mediaText,
        raw: {
          site: 'linkedin',
          pageType: 'posts',
          captureMode: 'visible_posts',
          searchQuery,
          authorTitle: headline,
          authorProfileUrl: profileUrl,
          visibleCompanyUrl: companyUrl,
          rawDateText,
          relevanceTier: tier,
          relevanceScore: score,
          relevanceMatched: matched,
          cardCount: cards.length,
          metricText: metricText.slice(0, 1000),
          visibleText: card.innerText.slice(0, 3000),
          viewportTop: Math.round(rect.top),
          viewportBottom: Math.round(rect.bottom),
        },
      };
    }),
  );

  const order = { hot: 0, warm: 1, cold: 2, skip: 3 } as const;
  items.sort(
    (a, b) =>
      (order[(a.raw.relevanceTier as keyof typeof order) ?? 'skip'] ?? 3) -
      (order[(b.raw.relevanceTier as keyof typeof order) ?? 'skip'] ?? 3),
  );

  return {
    source: 'linkedin',
    parserVersion: 'linkedin-visible-posts-v2',
    captureMode: 'visible_posts',
    searchQuery,
    items,
  };
}

function parsePeople(): ParserResult {
  const cards = filterVisibleCards(findPostCards()).filter((el) => el.innerText.length > 20);
  const items = compactItems(
    cards.slice(0, 30).map((card): ExtensionCaptureItem => {
      const { name, headline, profileUrl, company } = extractAuthor(card);
      return {
        title: name ?? pick(card, '.entity-result__title-text') ?? 'Unknown',
        description: pick(card, '.entity-result__summary') ?? headline,
        companyName: company ?? pick(card, '.entity-result__secondary-subtitle'),
        contactName: name,
        url: profileUrl ?? href(card, 'a.app-aware-link', 'a[href*="/in/"]'),
        country: pick(card, '.entity-result__tertiary-subtitle'),
        raw: { site: 'linkedin', pageType: 'people', visibleText: card.innerText.slice(0, 2000) },
      };
    }),
  );
  return { source: 'linkedin', parserVersion: 'linkedin-people-v5', items };
}

function parseJobs(): ParserResult {
  const cards = document.querySelectorAll<HTMLElement>('.job-card-list__title, .job-card-container__link');
  const containers = new Set<HTMLElement>();
  cards.forEach((el) => {
    let parent: HTMLElement | null = el;
    for (let depth = 0; depth < 8 && parent; depth++) {
      if (parent.tagName === 'LI' || (parent.className ?? '').toString().includes('job-card')) {
        containers.add(parent);
        break;
      }
      parent = parent.parentElement;
    }
  });
  const list = filterVisibleCards(containers.size > 0 ? [...containers] : findPostCards());
  const items = compactItems(
    list.slice(0, 30).map((card): ExtensionCaptureItem => ({
      title: pick(card, '.job-card-list__title', '.job-card-container__link', 'a[aria-label]'),
      description: pick(card, '.job-card-list__insight', '.job-card-list__snippet'),
      companyName: pick(card, '.job-card-container__company-name', '.job-card-list__company-name'),
      url: href(card, 'a[href*="/jobs/view/"]', 'a.job-card-list__title-link'),
      country: pick(card, '.job-card-container__metadata-item--workplace-type'),
      raw: { site: 'linkedin', pageType: 'jobs', visibleText: card.innerText.slice(0, 2000) },
    })),
  );
  return { source: 'linkedin', parserVersion: 'linkedin-jobs-v5', items };
}

export function parseLinkedIn(): ParserResult {
  const type = pageType();
  if (type === 'people') return parsePeople();
  if (type === 'jobs') return parseJobs();
  return parsePosts();
}
