import { Controller, Get, Post, Put, Delete, Param, Body, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { inviteMemberSchema } from '@radar/contracts';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('invite')
  @RequirePermission('members.manage')
  async invite(@Body() body: any, @CurrentUser() user: RequestPrincipal) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization context required');
    }
    
    // Parse the incoming body with the contract schema
    const parsed = inviteMemberSchema.parse(body);
    
    return this.usersService.inviteUser(
      parsed.email, 
      parsed.roleSlug, 
      user.organizationId, 
      user.userId,
      parsed.password
    );
  }

  @Get('members')
  @RequirePermission('members.manage')
  async getMembers(@CurrentUser() user: RequestPrincipal) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.usersService.getMembers(user.organizationId);
  }

  @Put('members/:id/role')
  @RequirePermission('members.manage')
  async updateMemberRole(
    @Param('id') memberId: string,
    @Body('roleSlug') roleSlug: string,
    @CurrentUser() user: RequestPrincipal
  ) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.usersService.updateMemberRole(user.organizationId, memberId, roleSlug);
  }

  @Delete('members/:id')
  @RequirePermission('members.manage')
  async removeMember(
    @Param('id') memberId: string,
    @CurrentUser() user: RequestPrincipal
  ) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.usersService.removeMember(user.organizationId, memberId);
  }
}
