import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExternalProviderAdapterRegistryService } from './external-provider-adapter-registry.service';
import {
  ApifyAdapterService,
  BrightDataAdapterService,
  FirecrawlAdapterService,
  MockExternalProviderAdapterService,
  PeopleDataLabsAdapterService,
  ScraperApiAdapterService,
  SerpApiAdapterService,
  TavilyAdapterService,
} from './external-provider-adapters.service';
import { ExternalProviderAdminService } from './external-provider-admin.service';
import { ExternalProviderCacheService } from './external-provider-cache.service';
import { ExternalProviderCapacityService } from './external-provider-capacity.service';
import { ExternalCostCalculatorService } from './external-cost-calculator.service';
import { ExternalProviderIntelligenceService } from './external-provider-intelligence.service';
import { ExternalProviderOrchestratorService } from './external-provider-orchestrator.service';
import { ExternalProviderPoolService } from './external-provider-pool.service';
import { ExternalProviderRateLimitService } from './external-provider-rate-limit.service';
import { ExternalProviderRoutingService } from './external-provider-routing.service';
import { ExternalProviderUsageService } from './external-provider-usage.service';
import { LeadHuntingClassificationService } from './lead-hunting-classification.service';
import { LeadHuntingController } from './lead-hunting.controller';
import { LeadHuntingCrmHandoffService } from './lead-hunting-crm-handoff.service';
import { LeadHuntingOperationsService } from './lead-hunting-operations.service';
import { LeadHuntingResearchService } from './lead-hunting-research.service';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [LeadHuntingController],
  providers: [
    ExternalProviderAdapterRegistryService,
    BrightDataAdapterService,
    ApifyAdapterService,
    PeopleDataLabsAdapterService,
    TavilyAdapterService,
    SerpApiAdapterService,
    FirecrawlAdapterService,
    ScraperApiAdapterService,
    MockExternalProviderAdapterService,
    ExternalProviderAdminService,
    ExternalProviderCacheService,
    ExternalProviderCapacityService,
    ExternalCostCalculatorService,
    ExternalProviderIntelligenceService,
    ExternalProviderRateLimitService,
    ExternalProviderRoutingService,
    ExternalProviderUsageService,
    ExternalProviderPoolService,
    ExternalProviderOrchestratorService,
    LeadHuntingClassificationService,
    LeadHuntingCrmHandoffService,
    LeadHuntingOperationsService,
    LeadHuntingResearchService,
  ],
  exports: [
    ExternalProviderAdapterRegistryService,
    BrightDataAdapterService,
    ApifyAdapterService,
    PeopleDataLabsAdapterService,
    TavilyAdapterService,
    SerpApiAdapterService,
    FirecrawlAdapterService,
    ScraperApiAdapterService,
    MockExternalProviderAdapterService,
    ExternalProviderAdminService,
    ExternalProviderCacheService,
    ExternalProviderCapacityService,
    ExternalCostCalculatorService,
    ExternalProviderIntelligenceService,
    ExternalProviderRateLimitService,
    ExternalProviderRoutingService,
    ExternalProviderUsageService,
    ExternalProviderPoolService,
    ExternalProviderOrchestratorService,
    LeadHuntingClassificationService,
    LeadHuntingCrmHandoffService,
    LeadHuntingOperationsService,
    LeadHuntingResearchService,
  ],
})
export class LeadHuntingModule {}
