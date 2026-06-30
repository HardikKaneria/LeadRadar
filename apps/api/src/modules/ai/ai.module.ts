import { Global, Module } from '@nestjs/common';
import { ActionPlannerService } from './action-planner.service';
import { AiRateLimitService } from './ai-rate-limit.service';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService } from './ai-settings.service';
import { AiProviderPoolService } from './ai-provider-pool.service';
import { AiPromptService } from './ai-prompt.service';
import { AiRoutingService } from './ai-routing.service';
import { CompanyResearchService } from './company-research.service';
import { OpportunityAnalyzerService } from './opportunity-analyzer.service';
import { OpportunityAnalyzerController } from './opportunity-analyzer.controller';
import { ProposalService } from './proposal.service';
import { SalesAssistantController } from './sales-assistant.controller';
import { SalesAssistantService } from './sales-assistant.service';
import { ScoringStrategyService } from './scoring-strategy.service';
import { AiUsageService } from './ai-usage.service';

@Global()
@Module({
  controllers: [AiSettingsController, SalesAssistantController, OpportunityAnalyzerController],
  providers: [
    ActionPlannerService,
    AiRateLimitService,
    AiSettingsService,
    AiRoutingService,
    AiPromptService,
    ScoringStrategyService,
    AiUsageService,
    AiProviderPoolService,
    OpportunityAnalyzerService,
    CompanyResearchService,
    ProposalService,
    SalesAssistantService,
  ],
  exports: [
    ActionPlannerService,
    AiRateLimitService,
    AiSettingsService,
    AiRoutingService,
    AiPromptService,
    ScoringStrategyService,
    AiUsageService,
    AiProviderPoolService,
    OpportunityAnalyzerService,
    CompanyResearchService,
    ProposalService,
    SalesAssistantService,
  ],
})
export class AiModule {}
