import type { ExtensionConfig } from '../lib/types';

const apiBaseUrlInput = document.querySelector<HTMLInputElement>('#api-base-url');
const captureTokenInput = document.querySelector<HTMLTextAreaElement>('#capture-token');
const statusEl = document.querySelector<HTMLElement>('#status');

async function load() {
  const state = (await chrome.runtime.sendMessage({ type: 'radar:get-state' })) as ExtensionConfig;
  if (apiBaseUrlInput) apiBaseUrlInput.value = state.apiBaseUrl;
  if (captureTokenInput) captureTokenInput.value = state.captureToken;
}

document.querySelector('#save-config')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({
    type: 'radar:save-config',
    apiBaseUrl: apiBaseUrlInput?.value,
    captureToken: captureTokenInput?.value,
  });

  if (statusEl) {
    statusEl.textContent = 'Saved extension settings.';
  }
});

void load();
