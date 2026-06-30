import type { CaptureRequestMessage, CaptureResult } from '../lib/types';
import { parseFreelancer } from '../parsers/freelancer';
import { parseGeneric } from '../parsers/generic';
import { parseLinkedIn } from '../parsers/linkedin';
import { parseUpwork } from '../parsers/upwork';
import { showCaptureOverlay } from './overlay';

function parseForCurrentPage() {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('linkedin.com')) return parseLinkedIn();
  if (host.includes('upwork.com')) return parseUpwork();
  if (host.includes('freelancer.com')) return parseFreelancer();
  return parseGeneric();
}

async function captureAndReview(): Promise<CaptureResult> {
  const parsed = parseForCurrentPage();
  console.info('[Radar] parser:', parsed.parserVersion, '| items found:', parsed.items.length);
  if (parsed.items.length === 0) {
    // Dump DOM snapshot to help diagnose selector mismatches
    const listEl = document.querySelector('.search-results-container, #main, .scaffold-finite-scroll__content, .core-rail');
    console.info('[Radar] container children:', listEl?.children.length ?? 0, listEl?.children[0]?.className ?? 'none');
  }
  const resolved = parsed.items.length > 0 || parsed.source === 'linkedin' ? parsed : parseGeneric();
  if (resolved.items.length === 0) {
    return {
      ok: false,
      error:
        parsed.source === 'linkedin'
          ? 'No visible LinkedIn posts found on this page.'
          : 'No visible items found on this page.',
    };
  }

  const selected = await showCaptureOverlay(resolved.items);

  if (!selected) {
    return { ok: false, cancelled: true };
  }
  if (selected.length === 0) {
    return { ok: false, error: 'No items selected.' };
  }

  return {
    ok: true,
    payload: {
      source: resolved.source,
      capturedUrl: window.location.href,
      capturedAt: new Date().toISOString(),
      captureMode: resolved.captureMode,
      searchQuery: resolved.searchQuery,
      parserVersion: resolved.parserVersion,
      items: selected,
    },
  };
}

chrome.runtime.onMessage.addListener((message: CaptureRequestMessage, _sender: unknown, sendResponse: (result: CaptureResult) => void) => {
  if (message.type !== 'radar:capture') return undefined;
  void captureAndReview()
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : 'Capture failed';
      sendResponse({ ok: false, error: messageText });
    });
  return true;
});
