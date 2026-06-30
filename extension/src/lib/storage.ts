import type { ExtensionConfig, QueuedBatch } from './types';

const STORAGE_KEY = 'radarExtensionConfig';

export const DEFAULT_CONFIG: ExtensionConfig = {
  apiBaseUrl: 'http://localhost:4000',
  captureToken: '',
  workspaceName: '',
  queuedBatches: [],
  lastStatus: null,
};

export async function readConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const config = stored?.[STORAGE_KEY] as Partial<ExtensionConfig> | undefined;
  return {
    ...DEFAULT_CONFIG,
    ...config,
    queuedBatches: config?.queuedBatches ?? [],
  };
}

export async function writeConfig(patch: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
  const next = { ...(await readConfig()), ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function queueBatch(batch: QueuedBatch): Promise<ExtensionConfig> {
  const config = await readConfig();
  const next = { ...config, queuedBatches: [...config.queuedBatches, batch] };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
