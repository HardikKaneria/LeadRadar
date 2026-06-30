import { Injectable } from '@nestjs/common';
import type { ExternalProvider, ExternalProviderAdapter } from './external-provider.types';

@Injectable()
export class ExternalProviderAdapterRegistryService {
  private readonly adapters = new Map<ExternalProvider, ExternalProviderAdapter>();

  register(adapter: ExternalProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: ExternalProvider): ExternalProviderAdapter | undefined {
    return this.adapters.get(provider);
  }
}
