import { Controller, Get, Post, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { BillingService, type SubscriptionWithPlan, type PlanSummary } from './billing.service';
import { DataLifecycleService } from './data-lifecycle.service';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly dataLifecycle: DataLifecycleService,
  ) {}

  // ── Plans (public — pricing page can read these) ─────────────────────────
  @Get('billing/plans')
  @Public()
  listPlans(): Promise<PlanSummary[]> {
    return this.billingService.listPlans();
  }

  // ── Current org subscription ─────────────────────────────────────────────
  @Get('billing/subscription')
  @UseGuards(SupabaseAuthGuard)
  @RequirePermission('billing.manage')
  getSubscription(@CurrentUser() user: RequestPrincipal): Promise<SubscriptionWithPlan | null> {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.billingService.getSubscription(user.organizationId);
  }

  @Get('billing/usage')
  @UseGuards(SupabaseAuthGuard)
  @RequirePermission('billing.manage')
  getUsage(@CurrentUser() user: RequestPrincipal): Promise<Record<string, number>> {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.billingService.getUsage(user.organizationId);
  }

  // ── Admin: assign / change plan for any org ──────────────────────────────
  @Post('admin/billing/assign')
  @UseGuards(PlatformAdminGuard)
  adminAssignPlan(
    @Body() body: { organizationId: string; planSlug: string },
  ): Promise<SubscriptionWithPlan> {
    if (!body.organizationId || !body.planSlug) {
      throw new BadRequestException('organizationId and planSlug are required');
    }
    return this.billingService.assignPlan(body.organizationId, body.planSlug);
  }

  @Get('admin/billing/subscriptions')
  @UseGuards(PlatformAdminGuard)
  adminListSubscriptions(): Promise<any[]> {
    return this.billingService.listAllSubscriptions();
  }

  @Get('admin/billing/organizations')
  @UseGuards(PlatformAdminGuard)
  adminListOrganizations(): Promise<{ id: string; name: string; created_at: string }[]> {
    return this.billingService.listAllOrganizations();
  }

  @Get('admin/billing/org/:orgId')
  @UseGuards(PlatformAdminGuard)
  async adminGetOrgSubscription(@Param('orgId') orgId: string): Promise<{
    subscription: SubscriptionWithPlan | null;
    usage: Record<string, number>;
  }> {
    const [subscription, usage] = await Promise.all([
      this.billingService.getSubscription(orgId),
      this.billingService.getUsage(orgId),
    ]);
    return { subscription, usage };
  }

  // ── Stripe webhook (public) ───────────────────────────────────────────────
  @Post('billing/webhook')
  async handleWebhook(@Body() payload: any): Promise<{ received: boolean }> {
    await this.billingService.processWebhook(payload.type ?? 'unknown', payload);
    return { received: true };
  }

  // ── Data lifecycle ────────────────────────────────────────────────────────
  @Get('data/export')
  @UseGuards(SupabaseAuthGuard)
  @RequirePermission('company.manage')
  exportData(@CurrentUser() user: RequestPrincipal) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.dataLifecycle.exportOrganizationData(user.organizationId);
  }

  @Post('data/delete')
  @UseGuards(SupabaseAuthGuard)
  @RequirePermission('company.manage')
  deleteOrg(@CurrentUser() user: RequestPrincipal) {
    if (!user.organizationId) throw new BadRequestException('Organization context required');
    return this.dataLifecycle.deleteOrganization(user.organizationId);
  }
}
