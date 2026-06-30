import type { AiTaskType, ProviderCallMetadata } from '../types';

export interface ProviderCredential extends ProviderCallMetadata {
  apiKey: string;
}

export type ResolveProviderCredential = (
  taskType: AiTaskType,
) => ProviderCredential | Promise<ProviderCredential>;

export async function getProviderCredential(
  taskType: AiTaskType,
  config: { apiKey?: string; resolveCredential?: ResolveProviderCredential },
): Promise<ProviderCredential> {
  if (config.resolveCredential) {
    const credential = await config.resolveCredential(taskType);
    if (!credential.apiKey.trim()) {
      throw new Error('provider credential resolver returned an empty apiKey');
    }
    return credential;
  }

  if (config.apiKey?.trim()) {
    return { apiKey: config.apiKey };
  }

  throw new Error('provider credential is not configured');
}
