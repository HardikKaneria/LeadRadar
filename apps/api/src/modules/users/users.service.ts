import { Injectable, Inject, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { type ServiceClient } from '@radar/supabase';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async inviteUser(email: string, roleSlug: string, organizationId: string, invitedBy: string, password?: string, name?: string) {
    // 1. Resolve role ID (system role or org-specific role)
    const { data: roleData, error: roleError } = await this.supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('slug', roleSlug)
      .maybeSingle();

    let resolvedRoleId = roleData?.id;

    if (!resolvedRoleId) {
      const { data: sysRoleData, error: sysRoleError } = await this.supabase
        .from('roles')
        .select('id')
        .is('organization_id', null)
        .eq('slug', roleSlug)
        .single();
        
      if (sysRoleError || !sysRoleData) {
        throw new BadRequestException('Invalid role slug');
      }
      resolvedRoleId = sysRoleData.id;
    }

    // 2. Send invite using Supabase Auth Admin
    let userId: string;
    
    if (password) {
      const { data, error } = await this.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: name ? { name } : undefined,
      });
      
      if (error) {
        this.logger.error(`Failed to create user ${email}: ${error.message}`);
        throw new InternalServerErrorException(`Failed to create user: ${error.message}`);
      }
      userId = data.user.id;
    } else {
      const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(email);

      if (error) {
        this.logger.error(`Failed to invite user ${email}: ${error.message}`);
        throw new InternalServerErrorException(`Failed to send invite email: ${error.message}`);
      }
      userId = data.user.id;
    }

    // 3. Upsert membership (in case they were invited before or are re-invited)
    const { error: membershipError } = await this.supabase.from('memberships').upsert({
      organization_id: organizationId,
      user_id: userId,
      role_id: resolvedRoleId,
      invited_by: invitedBy,
      status: 'active',
    }, { onConflict: 'organization_id, user_id' });

    if (membershipError) {
      this.logger.error(`Failed to create membership for ${userId}: ${membershipError.message}`);
      throw new InternalServerErrorException('Failed to create membership record');
    }

    return { success: true, userId };
  }

  async getMembers(organizationId: string) {
    const { data, error } = await this.supabase
      .from('memberships')
      .select('id, user_id, status, created_at, roles(name, slug), users:user_id(email, display_name)')
      .eq('organization_id', organizationId);

    if (error) {
      this.logger.error('Failed to get members:', error);
      throw error;
    }

    return data;
  }

  async updateMemberRole(organizationId: string, memberId: string, roleSlug: string) {
    // 1. Get role ID for slug
    const { data: roleData, error: roleError } = await this.supabase
      .from('roles')
      .select('id')
      .eq('slug', roleSlug)
      .single();

    if (roleError || !roleData) {
      throw new BadRequestException(`Role ${roleSlug} not found`);
    }

    // 2. Update membership
    const { error } = await this.supabase
      .from('memberships')
      .update({ role_id: roleData.id })
      .eq('id', memberId)
      .eq('organization_id', organizationId);

    if (error) {
      this.logger.error('Failed to update member role:', error);
      throw error;
    }

    return { success: true };
  }

  async removeMember(organizationId: string, memberId: string) {
    const { error } = await this.supabase
      .from('memberships')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', organizationId);

    if (error) {
      this.logger.error('Failed to remove member:', error);
      throw error;
    }

    return { success: true };
  }
}
