import type { ParserResult } from './helpers';

export function parseGeneric(): ParserResult {
  const selection = window.getSelection()?.toString().trim() || undefined;
  const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || undefined;
  const firstHeading = document.querySelector('h1, h2')?.textContent?.trim() || undefined;
  const firstParagraph = Array.from(document.querySelectorAll('p'))
    .map((node) => node.textContent?.trim())
    .find((value) => value && value.length > 40);

  return {
    source: 'website',
    parserVersion: 'generic-v1',
    items: [
      {
        title: firstHeading ?? document.title,
        description: selection ?? firstParagraph ?? metaDescription,
        website: window.location.href,
        url: window.location.href,
        raw: {
          site: 'generic',
          pageTitle: document.title,
          metaDescription,
          selection,
        },
      },
    ],
  };
}
