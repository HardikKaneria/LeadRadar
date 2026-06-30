import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { UsageController } from './usage.controller';

@Module({
  imports: [AiModule],
  controllers: [UsageController],
})
export class UsageModule {}
