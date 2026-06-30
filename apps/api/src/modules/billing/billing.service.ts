import { Injectable, Inject, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';
import type { SubscriptionDto, BillingPlanDto, UsageLimitDto } from '@radar/contracts';

export interface SubscriptionWithPlan extends SubscriptionDto {
  plan: BillingPlanDto;
  limits: UsageLimitDto[];
}

export interface PlanSummary {
  id: string;
  name: string;
  slug: string;
  monthlyPrice: number;
  features: string[];
  limits: { resourceType: string; maxValue: number }[];
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  /** All available plans with their limits */
  async listPlans(): Promise<PlanSummary[]> {
    const { data, error } = await this.supabase
      .from('billing_plans')
      .select('*, limits:usage_limits(*)')
      .order('monthly_price', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      monthlyPrice: p.monthly_price,
      features: p.features ?? [],
      limits: (p.limits ?? []).map((l: any) => ({
        resourceType: l.resource_type,
        maxValue: l.max_value,
      })),
    }));
  }

  /** Fetch active subscription + plan + limits for an org */
  async getSubscription(organizationId: string): Promise<SubscriptionWithPlan | null> {
    const { data, error } = await this.supabase
      .from('billing_subscriptions')
      .select('*, plan:billing_plans(*, limits:usage_limits(*))')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    if (!data) return null;

    return this.mapSubscription(data);
  }

  /** Admin: assign or change a plan for any org (upsert) */
  async assignPlan(organizationId: string, planSlug: string): Promise<SubscriptionWithPlan> {
    // Resolve plan
    const { data: plan, error: planErr } = await this.supabase
      .from('billing_plans')
      .select('id, name')
      .eq('slug', planSlug)
      .single();

    if (planErr || !plan) throw new NotFoundException(`Plan "${planSlug}" not found`);

    // Cancel any existing active subscription first
    await this.supabase
      .from('billing_subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    // Insert new active subscription
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { error: insertErr } = await this.supabase
      .from('billing_subscriptions')
      .insert({
        organization_id: organizationId,
        plan_id: plan.id,
        status: 'active',
        current_period_end: periodEnd.toISOString(),
      });

    if (insertErr) throw insertErr;

    const sub = await this.getSubscription(organizationId);
    if (!sub) throw new BadRequestException('Failed to create subscription');

    this.logger.log(`Assigned plan "${plan.name}" to org ${organizationId}`);
    return sub;
  }

  /** Check if org is within its limit for a resource type.
   *  -1 = unlimited. No subscription = fail open (dev / free tier). */
  async checkUsageLimit(organizationId: string, resourceType: string, currentValue: number): Promise<boolean> {
    const sub = await this.getSubscription(organizationId);
    if (!sub) return true; // no subscription → fail open

    const limit = sub.limits.find((l) => l.resourceType === resourceType);
    if (!limit) return true;       // no limit defined for this resource → unlimited
    if (limit.maxValue === -1) return true; // explicit unlimited

    return currentValue < limit.maxValue;
  }

  /** Current usage counts for an org across all tracked resource types */
  async getUsage(organizationId: string): Promise<Record<string, number>> {
    const [aiReqs, discoveries, opportunities, memberships] = await Promise.all([
      this.supabase
        .from('ai_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()),
      this.supabase
        .from('discoveries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('deleted_at', null),
      this.supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .is('deleted_at', null),
      this.supabase
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'active'),
    ]);

    return {
      ai_requests:   aiReqs.count ?? 0,
      discoveries:   discoveries.count ?? 0,
      opportunities: opportunities.count ?? 0,
      seats:         memberships.count ?? 0,
    };
  }

  /** Admin: all organizations (service role — bypasses RLS) */
  async listAllOrganizations(): Promise<{ id: string; name: string; created_at: string }[]> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as { id: string; name: string; created_at: string }[];
  }

  /** Admin: all subscriptions with org name + plan name */
  async listAllSubscriptions(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('billing_subscriptions')
      .select(`
        id, status, current_period_end, created_at, updated_at,
        organization:organizations(id, name),
        plan:billing_plans(id, name, slug, monthly_price)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async processWebhook(type: string, payload: any): Promise<void> {
    const { error } = await this.supabase.from('billing_events').insert({ type, payload });
    if (error) {
      this.logger.error(`Failed to record billing event ${type}:`, error);
      throw new BadRequestException('Failed to process billing event');
    }
  }

  private mapSubscription(data: any): SubscriptionWithPlan {
    return {
      id: data.id,
      organizationId: data.organization_id,
      planId: data.plan_id,
      providerSubscriptionId: data.provider_subscription_id,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      plan: {
        id: data.plan.id,
        providerProductId: data.plan.provider_product_id,
        name: data.plan.name,
        slug: data.plan.slug,
        monthlyPrice: data.plan.monthly_price,
        features: data.plan.features ?? [],
        createdAt: data.plan.created_at,
        updatedAt: data.plan.updated_at,
      },
      limits: (data.plan.limits ?? []).map((l: any) => ({
        id: l.id,
        planId: l.plan_id,
        resourceType: l.resource_type,
        maxValue: l.max_value,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })),
    };
  }
}
