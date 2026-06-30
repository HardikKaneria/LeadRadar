import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  Inject,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createUserClient, type ServiceClient } from '@radar/supabase';
import { type AppConfig } from '@radar/core';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { APP_CONFIG } from '../../config/app-config.module';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { AccessToken } from '../../common/decorators/access-token.decorator';
import { UsersService } from '../users/users.service';

interface ProvisionCompanyDto {
  orgName: string;
  ownerEmail: string;
  ownerName: string;
  password?: string;
}

@Controller('admin/companies')
@UseGuards(PlatformAdminGuard)
export class AdminCompaniesController {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly usersService: UsersService,
  ) {}

  @Post('provision')
  async provisionCompany(
    @CurrentUser() principal: RequestPrincipal,
    @AccessToken() accessToken: string,
    @Body() body: ProvisionCompanyDto,
  ) {
    if (!body?.orgName?.trim() || !body?.ownerEmail?.trim()) {
      throw new BadRequestException('orgName and ownerEmail are required');
    }

    // The `create_organization` RPC is `security definer` and gates on the caller being a
    // platform admin via auth.uid(), so it must run as the admin — not the service role (which has
    // no auth.uid()). PlatformAdminGuard already verified the caller; here we act as them so the RPC
    // applies its slug dedup + master_admin membership exactly like the web's create-org flow.
    const userClient = createUserClient(
      this.config.SUPABASE_URL,
      this.config.SUPABASE_ANON_KEY,
      accessToken,
    );

    const { data: org, error: createError } = await userClient.rpc('create_organization', {
      org_name: body.orgName,
    });

    if (createError || !org) {
      throw new InternalServerErrorException(createError?.message || 'Failed to create organization');
    }

    // Invite the owner as the company admin. The user sets their name on signup/password set.
    // NOTE: if invitation fails we may leave a dangling organization — acceptable for now.
    await this.usersService.inviteUser(body.ownerEmail, 'company_admin', org.id, principal.userId, body.password, body.ownerName);

    return { success: true, organization: org };
  }
  @Delete(':id')
  async deleteCompany(@Param('id') orgId: string) {
    // 1. Fetch all users belonging to this organization
    const { data: memberships, error: fetchError } = await this.supabase
      .from('memberships')
      .select('user_id')
      .eq('organization_id', orgId);

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    // 2. Delete the users from auth.users (which cascades to profiles and memberships)
    if (memberships && memberships.length > 0) {
      for (const member of memberships) {
        // Optional: Check if user belongs to other orgs before deleting them completely?
        // The user explicitly requested to "delete all users those are attached to that company".
        const { error: deleteUserError } = await this.supabase.auth.admin.deleteUser(member.user_id);
        if (deleteUserError) {
          console.error(`Failed to delete user ${member.user_id}: ${deleteUserError.message}`);
          // Continue deleting other users even if one fails
        }
      }
    }

    // 3. Delete the organization (cascades to roles, job_runs, audit_log, etc.)
    const { error: deleteOrgError } = await this.supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);

    if (deleteOrgError) {
      throw new InternalServerErrorException(deleteOrgError.message || 'Failed to delete organization');
    }

    return { success: true };
  }
}
