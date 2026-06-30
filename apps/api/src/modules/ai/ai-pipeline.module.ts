import { Module } from '@nestjs/common';
import { AiModule } from './ai.module';
import { AiPipelineWorker } from './ai-pipeline.worker';
import { DiscoveryPipelineController } from './discovery-pipeline.controller';
import { DiscoveryPipelineService } from './discovery-pipeline.service';
import { ProposalController } from './proposal.controller';
import { BillingModule } from '../billing/billing.module';

/**
 * Async AI analysis pipeline (P3-07). Hosts the `analyze-discovery` / `generate-embedding`
 * consumers + their trigger endpoint alongside the AI services they reuse (see [[D-025]]).
 */
@Module({
  imports: [BillingModule, AiModule],
  controllers: [DiscoveryPipelineController, ProposalController],
  providers: [DiscoveryPipelineService, AiPipelineWorker],
  exports: [DiscoveryPipelineService],
})
export class AiPipelineModule {}
