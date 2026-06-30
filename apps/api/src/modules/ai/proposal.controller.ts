import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  generateProposalSchema,
  proposalFilterSchema,
  updateProposalStatusSchema,
  type GenerateProposalInput,
  type JobAccepted,
  type ProposalFilterInput,
  type ProposalSummary,
  type UpdateProposalStatusInput,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { DiscoveryPipelineService } from './discovery-pipeline.service';

/** Proposal Generator endpoints (P6-03). Generate proposal → job; CRUD gated by leads.*. */
@ApiTags('proposals')
@Controller('proposals')
export class ProposalController {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pipeline: DiscoveryPipelineService,
  ) {}

  private orgOf(user: RequestPrincipal): string {
    if (!user.organizationId) throw new ValidationError('Missing x-organization-id header');
    return user.organizationId;
  }

  /** Enqueue an async proposal generation job for a lead or opportunity. */
  @Post('generate')
  @RequirePermission('ai.use')
  generate(
    @CurrentUser() user: RequestPrincipal,
    @Body(new ZodValidationPipe(generateProposalSchema)) body: GenerateProposalInput,
  ): Promise<JobAccepted> {
    return this.pipeline.enqueueGenerateProposal(this.orgOf(user), body.entityType, body.entityId, user.userId);
  }

  /** List proposals for the organisation, optionally filtered by entity. */
  @Get()
  @RequirePermission('leads.read')
  async list(
    @CurrentUser() user: RequestPrincipal,
    @Query() query: ProposalFilterInput,
  ): Promise<ProposalSummary[]> {
    const filter = proposalFilterSchema.parse(query);
    const orgId = this.orgOf(user);

    let q = this.supabase
      .from('proposals')
      .select('id, lead_id, opportunity_id, title, status, value, currency, created_at, updated_at')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter.entityType === 'lead' && filter.entityId) q = q.eq('lead_id', filter.entityId);
    else if (filter.entityType === 'opportunity' && filter.entityId) q = q.eq('opportunity_id', filter.entityId);
    if (filter.status) q = q.eq('status', filter.status as never);

    const { data, error } = await q;
    if (error) throw new Error(`Failed to list proposals: ${error.message}`);

    return ((data ?? []) as Array<Record<string, unknown>>).map(toProposalSummary);
  }

  /** Advance a proposal status (sent / accepted / rejected / expired). */
  @Patch(':id/status')
  @RequirePermission('leads.write')
  async updateStatus(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') proposalId: string,
    @Body(new ZodValidationPipe(updateProposalStatusSchema)) body: UpdateProposalStatusInput,
  ): Promise<ProposalSummary> {
    const orgId = this.orgOf(user);
    const stamp =
      body.status === 'sent' ? { sent_at: new Date().toISOString() }
      : body.status === 'accepted' ? { accepted_at: new Date().toISOString() }
      : body.status === 'rejected' ? { rejected_at: new Date().toISOString() }
      : {};

    const { data, error } = await this.supabase
      .from('proposals')
      .update({ status: body.status as never, ...stamp })
      .eq('id', proposalId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .select('id, lead_id, opportunity_id, title, status, value, currency, created_at, updated_at')
      .single();

    if (error || !data) throw new Error(`Failed to update proposal status: ${error?.message ?? 'not found'}`);
    return toProposalSummary(data as Record<string, unknown>);
  }
}

function toProposalSummary(row: Record<string, unknown>): ProposalSummary {
  return {
    id: row.id as string,
    leadId: (row.lead_id as string | null) ?? null,
    opportunityId: (row.opportunity_id as string | null) ?? null,
    title: row.title as string,
    status: row.status as ProposalSummary['status'],
    value: row.value != null ? Number(row.value) : null,
    currency: (row.currency as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
