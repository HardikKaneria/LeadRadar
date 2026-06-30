import { sendBatch } from '../lib/api-client';
import { queueBatch, readConfig, writeConfig } from '../lib/storage';
import type { AuthorizeMessage, CaptureResult, PopupCommandMessage, QueuedBatch } from '../lib/types';

const RETRY_ALARM = 'radar-extension-retry';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  void retryQueuedBatches();
});

chrome.alarms.onAlarm.addListener((alarm: { name: string }) => {
  if (alarm.name === RETRY_ALARM) {
    void retryQueuedBatches();
  }
});

// Messages from the popup
chrome.runtime.onMessage.addListener((message: PopupCommandMessage | AuthorizeMessage, _sender: unknown, sendResponse: (value: unknown) => void) => {
  if (message.type === 'radar:authorize') {
    const { token, apiBaseUrl, workspaceName } = message as AuthorizeMessage;
    void writeConfig({ captureToken: token.trim(), apiBaseUrl: apiBaseUrl.trim(), workspaceName: workspaceName ?? '' })
      .then(() => sendResponse({ ok: true }))
      .catch((err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : 'Save failed' }));
    return true;
  }

  if (message.type === 'radar:get-state') {
    void readConfig().then(sendResponse);
    return true;
  }

  if (message.type === 'radar:retry-queue') {
    void retryQueuedBatches().then(sendResponse);
    return true;
  }

  if (message.type === 'radar:capture-now') {
    void captureActiveTab().then(sendResponse);
    return true;
  }

  return undefined;
});

async function captureActiveTab() {
  const config = await readConfig();
  if (!config.captureToken.trim()) {
    return writeConfig({
      lastStatus: { kind: 'error', message: 'Not connected — open Radar app to connect the extension.', at: new Date().toISOString() },
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return writeConfig({
      lastStatus: { kind: 'error', message: 'No active tab found.', at: new Date().toISOString() },
    });
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/capture.js'],
  });

  const response = (await chrome.tabs.sendMessage(tab.id, { type: 'radar:capture' })) as CaptureResult;
  if (response?.cancelled) {
    return writeConfig({
      lastStatus: { kind: 'idle', message: 'Capture cancelled.', at: new Date().toISOString() },
    });
  }
  if (!response?.ok || !response.payload) {
    return writeConfig({
      lastStatus: { kind: 'error', message: response?.error ?? 'Capture failed.', at: new Date().toISOString() },
    });
  }

  return sendOrQueue(response.payload);
}

async function sendOrQueue(payload: CaptureResult['payload']) {
  if (!payload) return readConfig();

  const config = await readConfig();
  const idempotencyKey = buildIdempotencyKey();

  try {
    const accepted = await sendBatch({
      apiBaseUrl: config.apiBaseUrl,
      captureToken: config.captureToken,
      idempotencyKey,
      payload,
    });
    return writeConfig({
      lastStatus: {
        kind: 'success',
        message: `Sent ${payload.items.length} item(s) to Radar.`,
        batchId: accepted.batchId,
        jobId: accepted.jobId,
        at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Capture send failed';
    const queuedBatch: QueuedBatch = { idempotencyKey, payload, queuedAt: new Date().toISOString() };
    await queueBatch(queuedBatch);
    return writeConfig({
      lastStatus: { kind: 'queued', message: `${msg}. Saved to retry queue.`, at: new Date().toISOString() },
    });
  }
}

async function retryQueuedBatches() {
  const config = await readConfig();
  if (!config.captureToken.trim() || config.queuedBatches.length === 0) return config;

  const remaining: QueuedBatch[] = [];
  let successCount = 0;

  for (const queued of config.queuedBatches) {
    try {
      await sendBatch({
        apiBaseUrl: config.apiBaseUrl,
        captureToken: config.captureToken,
        idempotencyKey: queued.idempotencyKey,
        payload: queued.payload,
      });
      successCount += 1;
    } catch {
      remaining.push(queued);
    }
  }

  return writeConfig({
    queuedBatches: remaining,
    lastStatus:
      successCount > 0
        ? { kind: 'success', message: `Retried ${successCount} queued capture(s).`, at: new Date().toISOString() }
        : config.lastStatus,
  });
}

function buildIdempotencyKey(): string {
  return `ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
