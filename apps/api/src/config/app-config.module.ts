import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadConfig, type AppConfig } from '@radar/core';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
