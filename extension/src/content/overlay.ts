import type { ExtensionCaptureItem } from '../lib/types';
import { type RelevanceTier, TIER_COLOR, TIER_LABEL, scoreRelevance } from '../lib/relevance';

function labelFor(item: ExtensionCaptureItem): string {
  const firstLine = item.postText
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 20);
  return firstLine ?? item.title ?? item.visibleCompanyName ?? item.companyName ?? item.postUrl ?? item.url ?? 'Untitled item';
}

function getTier(item: ExtensionCaptureItem): RelevanceTier {
  const raw = item.raw.relevanceTier as RelevanceTier | undefined;
  if (raw) return raw;
  const text = [
    item.title,
    item.description,
    item.postText,
    item.companyName,
    item.visibleCompanyName,
    item.postOwnerHeadline,
  ]
    .filter(Boolean)
    .join(' ');
  return scoreRelevance(text).tier;
}

function formatMetric(label: string, value: number | undefined): string | null {
  return typeof value === 'number' ? `${value.toLocaleString()} ${label}` : null;
}

function selectionSummary(count: number): string {
  return count === 1 ? '1 post selected' : `${count} posts selected`;
}

export function showCaptureOverlay(items: ExtensionCaptureItem[]): Promise<ExtensionCaptureItem[] | null> {
  return new Promise((resolve) => {
    const tiered = items.map((item, index) => ({ index, item, tier: getTier(item) }));
    const hot = tiered.filter((entry) => entry.tier === 'hot').length;
    const warm = tiered.filter((entry) => entry.tier === 'warm').length;
    const skip = tiered.filter((entry) => entry.tier === 'skip').length;
    let activeFilter = 'all';

    const selected = new Set<number>(
      tiered.filter((entry) => entry.tier === 'hot' || entry.tier === 'warm').map((entry) => entry.index),
    );

    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(4,8,7,0.82);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';

    const panel = document.createElement('div');
    panel.style.cssText =
      'width:min(960px,94vw);max-height:88vh;overflow:hidden;display:flex;flex-direction:column;background:#0f1512;border:1px solid #2b3932;border-radius:18px;box-shadow:0 32px 100px rgba(0,0,0,0.6);color:#f4f7f5;';

    const header = document.createElement('div');
    header.style.cssText = 'padding:20px 24px 16px;border-bottom:1px solid #1e2e26;flex-shrink:0;';
    header.innerHTML = `
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3ddc97;font-weight:700;">Radar OIP · Lead Filter</div>
      <div style="margin-top:5px;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Review visible LinkedIn posts</div>
      <div style="margin-top:6px;font-size:12px;color:#90a79b;line-height:1.5;">Only posts currently visible in this tab are listed here. Uncheck anything noisy before sending.</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:12px;background:#0a2218;border:1px solid #1d4a33;color:#3ddc97;border-radius:20px;padding:3px 10px;font-weight:600;">🔥 ${hot} hot</span>
        <span style="font-size:12px;background:#1a1200;border:1px solid #4a3800;color:#f5a623;border-radius:20px;padding:3px 10px;font-weight:600;">👍 ${warm} possible</span>
        ${skip > 0 ? `<span style="font-size:12px;background:#1a0a0a;border:1px solid #3a1a1a;color:#6a8076;border-radius:20px;padding:3px 10px;">✗ ${skip} filtered out</span>` : ''}
        <span id="radar-ext-selected-count" style="font-size:11.5px;color:#4a6358;margin-left:auto;">${selectionSummary(selected.size)}</span>
      </div>
    `;

    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;gap:6px;padding:9px 24px;border-bottom:1px solid #141e19;flex-shrink:0;background:#0b100d;';
    filterBar.innerHTML = `
      <button data-filter="all"  style="${tabStyle(true)}">All (${items.length})</button>
      <button data-filter="hot"  style="${tabStyle(false)}">🔥 Hot (${hot})</button>
      <button data-filter="warm" style="${tabStyle(false)}">👍 Possible (${warm})</button>
      <button data-filter="cold" style="${tabStyle(false)}">❄️ Low signal</button>
      <button data-filter="skip" style="${tabStyle(false)}">✗ Not a lead</button>
    `;

    const list = document.createElement('div');
    list.id = 'radar-ext-list';
    list.style.cssText = 'flex:1;overflow-y:auto;padding:10px 16px;';

    const footer = document.createElement('div');
    footer.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 22px;border-top:1px solid #1e2e26;flex-shrink:0;background:#0b100d;';
    footer.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <button id="radar-ext-selall" style="${actionBtnStyle()}">Select all</button>
        <button id="radar-ext-selleads" style="${actionBtnStyle('#0a2218','#1d4a33','#3ddc97')}">✓ Leads only</button>
        <button id="radar-ext-selnone" style="${actionBtnStyle()}">None</button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
        <span id="radar-ext-footer-count" style="font-size:11.5px;color:#7f958a;">${selectionSummary(selected.size)}</span>
        <button id="radar-ext-cancel" style="border:1px solid #33443b;background:#151c19;color:#c9d3ce;border-radius:12px;padding:10px 18px;cursor:pointer;font-size:13px;font-family:inherit;">Cancel</button>
        <button id="radar-ext-send" style="border:0;background:#3ddc97;color:#062114;border-radius:12px;padding:10px 22px;font-weight:700;cursor:pointer;font-size:13px;font-family:inherit;">Send selected</button>
      </div>
    `;

    panel.append(header, filterBar, list, footer);
    host.appendChild(panel);
    document.body.appendChild(host);

    const selectedCountEl = panel.querySelector<HTMLElement>('#radar-ext-selected-count');
    const footerCountEl = panel.querySelector<HTMLElement>('#radar-ext-footer-count');
    const sendButton = panel.querySelector<HTMLButtonElement>('#radar-ext-send');

    function updateSelectionUi() {
      const summary = selectionSummary(selected.size);
      if (selectedCountEl) selectedCountEl.textContent = summary;
      if (footerCountEl) footerCountEl.textContent = summary;
      if (sendButton) {
        sendButton.disabled = selected.size === 0;
        sendButton.textContent = selected.size === 1 ? 'Send 1 post' : `Send ${selected.size} posts`;
        sendButton.style.opacity = selected.size === 0 ? '0.55' : '1';
        sendButton.style.cursor = selected.size === 0 ? 'not-allowed' : 'pointer';
      }
    }

    function renderRows(filterTier: string) {
      list.innerHTML = '';
      let count = 0;

      tiered.forEach(({ item, tier, index }) => {
        if (filterTier !== 'all' && tier !== filterTier) return;
        count += 1;

        const tierColor = TIER_COLOR[tier];
        const tierLabel = TIER_LABEL[tier];
        const description = item.postText ?? item.description ?? '—';
        const authorLine = item.postOwnerName ?? item.contactName;
        const headline = item.postOwnerHeadline ?? (item.raw.authorTitle as string | undefined);
        const companyName = item.visibleCompanyName ?? item.companyName;
        const profileUrl = item.postOwnerProfileUrl ?? (item.raw.authorProfileUrl as string | undefined);
        const postUrl = item.postUrl ?? item.url;
        const metaBits = [
          item.postDate,
          formatMetric('reactions', item.reactionCount),
          formatMetric('comments', item.commentCount),
          formatMetric('reposts', item.repostCount),
        ].filter(Boolean);

        const row = document.createElement('label');
        row.dataset.index = String(index);
        row.dataset.tier = tier;
        row.style.cssText = `
          display:grid;grid-template-columns:18px 1fr auto;gap:14px;align-items:start;
          padding:13px 14px;border-radius:12px;cursor:pointer;margin-bottom:5px;
          background:${tier === 'hot' ? 'rgba(61,220,151,0.05)' : tier === 'warm' ? 'rgba(245,166,35,0.04)' : 'rgba(255,255,255,0.01)'};
          border:1px solid ${tier === 'hot' ? '#1d4a33' : tier === 'warm' ? '#3a2e00' : '#1a2820'};
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected.has(index);
        checkbox.dataset.index = String(index);
        checkbox.style.cssText =
          'margin-top:3px;accent-color:#3ddc97;width:15px;height:15px;cursor:pointer;flex-shrink:0;';
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(index);
          else selected.delete(index);
          updateSelectionUi();
        });

        const body = document.createElement('div');
        body.style.cssText = 'min-width:0;';
        body.innerHTML = `
          ${authorLine ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
              <div>
                <div style="font-size:13px;font-weight:700;color:#f4f7f5;">${escapeHtml(authorLine)}</div>
                ${[headline, companyName].filter(Boolean).length > 0 ? `<div style="font-size:11px;color:#6a8076;margin-top:1px;">${escapeHtml([headline, companyName].filter(Boolean).join(' · '))}</div>` : ''}
                ${profileUrl ? `<a href="${escapeHtml(profileUrl)}" target="_blank" style="font-size:10.5px;color:#3ddc97;text-decoration:none;margin-top:1px;display:inline-block;">View profile ↗</a>` : ''}
              </div>
            </div>
          ` : ''}
          <div style="font-size:12.5px;font-weight:600;color:#e0ebe6;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(labelFor(item))}</div>
          ${metaBits.length > 0 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:10.5px;color:#90a79b;">${metaBits.map((bit) => `<span style="padding:2px 7px;border:1px solid #213029;border-radius:999px;background:#101713;">${escapeHtml(String(bit))}</span>`).join('')}</div>` : ''}
          <div style="color:#b0bfb8;font-size:12px;line-height:1.62;white-space:pre-line;word-break:break-word;">${escapeHtml(description.slice(0, 500).replace(/\n{3,}/g, '\n\n'))}</div>
          ${item.mediaText ? `<div style="margin-top:6px;font-size:11px;color:#8aa296;">Media: ${escapeHtml(item.mediaText.slice(0, 220))}</div>` : ''}
          ${item.budgetHint ? `<div style="margin-top:6px;font-size:11.5px;color:#f5a623;font-weight:600;">Budget hint: ${escapeHtml(String(item.budgetHint))}</div>` : ''}
          ${postUrl ? `<a href="${escapeHtml(postUrl)}" target="_blank" style="display:inline-block;margin-top:5px;font-size:10.5px;color:#3a6655;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">View post ↗</a>` : ''}
        `;

        const badge = document.createElement('div');
        badge.style.cssText = `font-size:10.5px;font-weight:700;color:${tierColor};white-space:nowrap;padding-top:2px;text-align:right;`;
        badge.textContent = tierLabel;

        row.append(checkbox, body, badge);
        list.appendChild(row);
      });

      if (count === 0) {
        list.innerHTML =
          '<div style="text-align:center;padding:48px 20px;color:#4a6358;font-size:13px;">No posts in this category</div>';
      }
    }

    function getSelected(): ExtensionCaptureItem[] {
      return tiered.filter((entry) => selected.has(entry.index)).map((entry) => entry.item);
    }

    function cleanup() {
      host.remove();
    }

    updateSelectionUi();
    renderRows('all');

    filterBar.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter ?? 'all';
        filterBar.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((button) => {
          button.style.cssText = tabStyle(false);
        });
        btn.style.cssText = tabStyle(true);
        renderRows(activeFilter);
      });
    });

    footer.querySelector('#radar-ext-selall')?.addEventListener('click', () => {
      tiered.forEach((entry) => selected.add(entry.index));
      renderRows(activeFilter);
      updateSelectionUi();
    });
    footer.querySelector('#radar-ext-selnone')?.addEventListener('click', () => {
      selected.clear();
      renderRows(activeFilter);
      updateSelectionUi();
    });
    footer.querySelector('#radar-ext-selleads')?.addEventListener('click', () => {
      selected.clear();
      tiered.forEach((entry) => {
        if (entry.tier === 'hot' || entry.tier === 'warm') selected.add(entry.index);
      });
      renderRows(activeFilter);
      updateSelectionUi();
    });

    footer.querySelector('#radar-ext-cancel')?.addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    footer.querySelector('#radar-ext-send')?.addEventListener('click', () => {
      if (selected.size === 0) return;
      cleanup();
      resolve(getSelected());
    });
    host.addEventListener('click', (event) => {
      if (event.target === host) {
        cleanup();
        resolve(null);
      }
    });
  });
}

function tabStyle(active: boolean): string {
  return active
    ? 'font-size:11.5px;font-weight:600;background:#0a2218;border:1px solid #1d4a33;color:#3ddc97;border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit;'
    : 'font-size:11.5px;background:transparent;border:1px solid #1a2820;color:#6a8076;border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit;';
}

function actionBtnStyle(bg = 'transparent', border = '#1a2820', color = '#8aa296'): string {
  return `font-size:11.5px;background:${bg};border:1px solid ${border};color:${color};border-radius:8px;padding:5px 11px;cursor:pointer;font-family:inherit;`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
