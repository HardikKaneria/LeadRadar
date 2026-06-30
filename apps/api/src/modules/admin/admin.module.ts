import { Module } from '@nestjs/common';
import { AdminExternalProvidersController } from './admin-external-providers.controller';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminUsageController } from './admin-usage.controller';
import { AdminCompaniesController } from './admin-companies.controller';
import { AdminRoutingController } from './admin-routing.controller';
import { AdminPromptsController } from './admin-prompts.controller';
import { LeadHuntingModule } from '../lead-hunting/lead-hunting.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, LeadHuntingModule],
  controllers: [
    AdminProvidersController,
    AdminExternalProvidersController,
    AdminUsageController,
    AdminCompaniesController,
    AdminRoutingController,
    AdminPromptsController,
  ],
  providers: [],
})
export class AdminModule {}
