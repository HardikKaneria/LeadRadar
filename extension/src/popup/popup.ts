import { readConfig } from '../lib/storage';
import type { ExtensionConfig } from '../lib/types';

const dotEl = document.querySelector<HTMLElement>('#conn-dot')!;
const workspaceEl = document.querySelector<HTMLElement>('#workspace-name')!;
const connStatusEl = document.querySelector<HTMLElement>('#conn-status')!;
const captureBtn = document.querySelector<HTMLButtonElement>('#capture-now')!;
const retryBtn = document.querySelector<HTMLButtonElement>('#retry-queue')!;
const disconnectBtn = document.querySelector<HTMLButtonElement>('#disconnect')!;
const openAppBtn = document.querySelector<HTMLButtonElement>('#open-app')!;
const connectedView = document.querySelector<HTMLElement>('#view-connected')!;
const disconnectedView = document.querySelector<HTMLElement>('#view-disconnected')!;
const lastCaptureEl = document.querySelector<HTMLElement>('#last-capture')!;
const queueEl = document.querySelector<HTMLElement>('#queue-count')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

const APP_URL = 'http://localhost:3000';

function setStatus(message: string, kind: 'success' | 'error' | 'info' | 'loading' = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status status--${kind}`;
}

function renderConfig(config: ExtensionConfig) {
  const connected = Boolean(config.captureToken.trim());

  connectedView.style.display = connected ? 'flex' : 'none';
  disconnectedView.style.display = connected ? 'none' : 'flex';

  if (connected) {
    dotEl.className = 'dot dot--ready';
    workspaceEl.textContent = config.workspaceName || 'Radar Workspace';
    connStatusEl.textContent = 'Connected';
  } else {
    dotEl.className = 'dot dot--idle';
  }

  // Last capture status
  if (config.lastStatus) {
    const time = new Date(config.lastStatus.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    lastCaptureEl.textContent = `${config.lastStatus.message} · ${time}`;
    lastCaptureEl.className = `last-capture last-capture--${config.lastStatus.kind}`;
  } else {
    lastCaptureEl.textContent = 'No captures yet.';
    lastCaptureEl.className = 'last-capture';
  }

  // Queue badge
  if (config.queuedBatches.length > 0) {
    queueEl.textContent = `${config.queuedBatches.length} queued`;
    queueEl.style.display = 'inline-flex';
  } else {
    queueEl.style.display = 'none';
  }
}

async function load() {
  const config = await readConfig();
  renderConfig(config);
}

// Capture current page
captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing…';
  setStatus('Sending to Radar…', 'loading');

  try {
    const result = (await chrome.runtime.sendMessage({ type: 'radar:capture-now' })) as ExtensionConfig;
    renderConfig(result);
    const kind = result.lastStatus?.kind;
    const msg = result.lastStatus?.message ?? 'Done.';
    setStatus(msg, kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'info');
  } catch (err: unknown) {
    setStatus(`Capture failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = '⚡ Capture Current Page';
  }
});

// Retry queue
retryBtn.addEventListener('click', async () => {
  retryBtn.disabled = true;
  retryBtn.textContent = 'Retrying…';
  try {
    const result = (await chrome.runtime.sendMessage({ type: 'radar:retry-queue' })) as ExtensionConfig;
    renderConfig(result);
    if (result.lastStatus) setStatus(result.lastStatus.message, result.lastStatus.kind === 'success' ? 'success' : 'info');
  } catch {
    setStatus('Retry failed.', 'error');
  } finally {
    retryBtn.disabled = false;
    retryBtn.textContent = 'Retry queue';
  }
});

// Disconnect — clear token from storage
disconnectBtn.addEventListener('click', async () => {
  if (!confirm('Disconnect this extension from Radar? You can reconnect anytime from the Radar app.')) return;
  const { writeConfig } = await import('../lib/storage');
  await writeConfig({ captureToken: '', workspaceName: '', apiBaseUrl: 'http://localhost:4000' });
  const config = await readConfig();
  renderConfig(config);
  setStatus('Disconnected.', 'info');
});

// Open Radar app settings
openAppBtn.addEventListener('click', () => {
  const url = `${APP_URL}/settings/extension`;
  if (chrome.tabs?.create) {
    void chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
});

void load();
