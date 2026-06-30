import { Inject, Injectable } from '@nestjs/common';
import {
  researchCompany,
  type AiCallContext,
  type AiCallRecord,
  type CompanyResearch,
  type ResearchCompanyInput,
} from '@radar/ai';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from './ai-provider-pool.service';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

const MAX_CONTEXT_OPPORTUNITIES = 5;

/**
 * Company Research writer (P4-04). Loads a company, gathers light context from its linked
 * opportunities, runs the pure `@radar/ai` researcher through the governed gateway, and persists the
 * result into `companies.enrichment` (back-filling `industry` / `tech_stack` only when they are
 * still empty). Mirrors the analyzer/planner writers; the job lifecycle lives in the pipeline.
 */
@Injectable()
export class CompanyResearchService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pool: AiProviderPoolService,
  ) {}

  async researchCompany(organizationId: string, companyId: string, userId: string): Promise<CompanyRow> {
    const company = await this.loadCompany(organizationId, companyId);
    const context = await this.loadOpportunityContext(organizationId, companyId);

    let lastCall: AiCallRecord | undefined;
    const ai = await this.pool.buildService({
      organizationId,
      hooks: {
        onCall: (record) => {
          if (record.status !== 'error') lastCall = record;
        },
      },
    });

    const input: ResearchCompanyInput = {
      name: company.name,
      domain: company.domain,
      website: company.domain ? `https://${company.domain}` : null,
      industry: company.industry,
      country: company.country,
      knownTechStack: company.tech_stack ?? [],
      context,
    };

    const ctx: AiCallContext = { taskType: 'company_research', organizationId, userId };
    const research = await researchCompany(ai, ctx, input);

    return this.applyResearch(organizationId, company, research, lastCall);
  }

  private async applyResearch(
    organizationId: string,
    company: CompanyRow,
    research: CompanyResearch,
    lastCall: AiCallRecord | undefined,
  ): Promise<CompanyRow> {
    const enrichment: Json = {
      summary: research.summary,
      industry: research.industry,
      techStack: research.techStack,
      problems: research.problems,
      suggestedServices: research.suggestedServices,
      researchedAt: new Date().toISOString(),
      aiPromptVersionId: lastCall?.aiPromptVersionId ?? null,
      model: lastCall ? { provider: lastCall.provider, model: lastCall.model } : null,
    };

    const patch: CompanyUpdate = { enrichment };
    // Only fill the structured columns when they're still empty — never clobber operator-entered data.
    if (!company.industry && research.industry) {
      patch.industry = research.industry;
    }
    if ((company.tech_stack?.length ?? 0) === 0 && research.techStack.length > 0) {
      patch.tech_stack = research.techStack;
    }

    const { data, error } = await this.supabase
      .from('companies')
      .update(patch)
      .eq('id', company.id)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist company research for ${company.id}: ${error?.message ?? 'unknown error'}`);
    }
    return data as CompanyRow;
  }

  private async loadCompany(organizationId: string, companyId: string): Promise<CompanyRow> {
    const { data, error } = await this.supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load company ${companyId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Company ${companyId} not found for organization ${organizationId}`);
    }
    return data as CompanyRow;
  }

  /** A short free-text hint built from the company's linked opportunity titles, if any. */
  private async loadOpportunityContext(organizationId: string, companyId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('opportunities')
      .select('title')
      .eq('organization_id', organizationId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(MAX_CONTEXT_OPPORTUNITIES);

    if (error || !data || data.length === 0) return null;

    const titles = (data as { title: string }[])
      .map((row) => row.title)
      .filter((title) => typeof title === 'string' && title.trim().length > 0);

    return titles.length ? `Active opportunities: ${titles.join('; ')}` : null;
  }
}
