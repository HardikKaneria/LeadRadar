import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module';
import { SupabaseModule } from './supabase/supabase.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { AiPipelineModule } from './modules/ai/ai-pipeline.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { ExtensionModule } from './modules/extension/extension.module';
import { HealthModule } from './modules/health/health.module';
import { UsageModule } from './modules/usage/usage.module';
import { AdminModule } from './modules/admin/admin.module';
import { UsersModule } from './modules/users/users.module';
import { WorkerModule } from './modules/worker/worker.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { BillingModule } from './modules/billing/billing.module';
import { AuditModule } from './modules/audit/audit.module';
import { LeadHuntingModule } from './modules/lead-hunting/lead-hunting.module';
import { SupabaseAuthGuard } from './modules/auth/supabase-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    AppConfigModule,
    SupabaseModule,
    QueueModule,
    AuthModule,
    KnowledgeModule,
    AiModule,
    AiPipelineModule,
    JobsModule,
    IngestionModule,
    ExtensionModule,
    HealthModule,
    UsageModule,
    AdminModule,
    UsersModule,
    WorkerModule,
    NotificationsModule,
    IntegrationsModule,
    BillingModule,
    AuditModule,
    LeadHuntingModule,
  ],
  providers: [
    // Authenticate (Supabase) first, then check permission keys.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
