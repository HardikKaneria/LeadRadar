import type { ExtensionCaptureItem, ExtensionCaptureMode, SupportedSource } from '../lib/types';

export interface ParserResult {
  source: SupportedSource;
  parserVersion: string;
  captureMode?: ExtensionCaptureMode;
  searchQuery?: string;
  items: ExtensionCaptureItem[];
}

export function isVisible(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

export function textOf(root: ParentNode, selector: string): string | undefined {
  const el = root.querySelector(selector);
  return el?.textContent?.trim() || undefined;
}

export function hrefOf(root: ParentNode, selector: string): string | undefined {
  const el = root.querySelector<HTMLAnchorElement>(selector);
  return el?.href;
}

export function visibleElements(selectors: string[]): HTMLElement[] {
  const unique = new Set<HTMLElement>();
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      if (isVisible(element)) unique.add(element);
    });
  }
  return [...unique];
}

export function compactItems(items: ExtensionCaptureItem[]): ExtensionCaptureItem[] {
  return items.filter((item) =>
    Boolean(
      item.title ||
        item.description ||
        item.companyName ||
        item.contactName ||
        item.email ||
        item.phone ||
        item.website ||
        item.url ||
        item.postUrl ||
        item.postText ||
        item.postOwnerName ||
        item.visibleCompanyName,
    ),
  );
}
