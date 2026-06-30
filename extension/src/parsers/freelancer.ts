import type { ParserResult } from './helpers';
import { compactItems, hrefOf, textOf, visibleElements } from './helpers';

export function parseFreelancer(): ParserResult {
  const cards = visibleElements([
    '.JobSearchCard-item',
    '.project-list-item',
    '[data-project-id]',
  ]);

  const items = compactItems(
    cards.slice(0, 20).map((card) => ({
      title: textOf(card, 'a.JobSearchCard-primary-heading-link, .JobSearchCard-primary-heading a, a[href*="/projects/"]'),
      description: textOf(card, '.JobSearchCard-primary-description, .description'),
      companyName: textOf(card, '.FreelancerInfo-profile-name, .EmployerProfile-name'),
      url: hrefOf(card, 'a[href*="/projects/"]'),
      country: textOf(card, '.JobSearchCard-primary-heading-days, .FreelancerInfo-location'),
      budgetHint: textOf(card, '.JobSearchCard-primary-price, .Budget-label'),
      raw: {
        site: 'freelancer',
        visibleText: card.innerText.slice(0, 4000),
      },
    })),
  );

  return {
    source: 'freelancer',
    parserVersion: 'freelancer-v1',
    items,
  };
}
