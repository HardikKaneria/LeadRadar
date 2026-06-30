import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { DataLifecycleService } from './data-lifecycle.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, DataLifecycleService],
  exports: [BillingService, DataLifecycleService],
})
export class BillingModule {}
