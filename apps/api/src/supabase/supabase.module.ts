import { Global, Module } from '@nestjs/common';
import { createServiceClient, type ServiceClient } from '@radar/supabase';
import { type AppConfig } from '@radar/core';
import { APP_CONFIG } from '../config/app-config.module';

export const SUPABASE_SERVICE = 'SUPABASE_SERVICE';
export const SUPABASE_RO_SERVICE = 'SUPABASE_RO_SERVICE';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_SERVICE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ServiceClient =>
        createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY),
    },
    {
      provide: SUPABASE_RO_SERVICE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): ServiceClient =>
        createServiceClient(
          config.SUPABASE_RO_URL || config.SUPABASE_URL,
          config.SUPABASE_RO_SERVICE_ROLE_KEY || config.SUPABASE_SERVICE_ROLE_KEY
        ),
    },
  ],
  exports: [SUPABASE_SERVICE, SUPABASE_RO_SERVICE],
})
export class SupabaseModule {}
