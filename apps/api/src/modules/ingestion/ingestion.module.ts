import { Module } from '@nestjs/common';
import { ExtensionModule } from '../extension/extension.module';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [ExtensionModule],
  controllers: [IngestionController],
  providers: [IngestionService, IdempotencyService],
})
export class IngestionModule {}
