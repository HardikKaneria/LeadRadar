import type { ParserResult } from './helpers';
import { compactItems, hrefOf, textOf, visibleElements } from './helpers';

export function parseUpwork(): ParserResult {
  const cards = visibleElements([
    'article.job-tile',
    '[data-test="JobTile"]',
    '.air3-card-section',
  ]);

  const items = compactItems(
    cards.slice(0, 20).map((card) => ({
      title: textOf(card, 'a[href*="/jobs/"], [data-test="job-tile-title-link"]'),
      description: textOf(card, '[data-test="job-description-text"], .air3-line-clamp'),
      companyName: textOf(card, '[data-test="client-name"], [data-test="client-location"]'),
      url: hrefOf(card, 'a[href*="/jobs/"]'),
      country: textOf(card, '[data-test="client-location"], strong[data-test="client-country"]'),
      budgetHint: textOf(card, '[data-test="job-type"], [data-test="budget"]'),
      raw: {
        site: 'upwork',
        visibleText: card.innerText.slice(0, 4000),
      },
    })),
  );

  return {
    source: 'upwork',
    parserVersion: 'upwork-v1',
    items,
  };
}
