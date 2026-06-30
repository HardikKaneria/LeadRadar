import { Controller, Get, Post, Put, Param, Body, Inject, UseGuards } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@UseGuards(PlatformAdminGuard)
@Controller('admin/prompts')
export class AdminPromptsController {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  @Get()
  async getPrompts() {
    const { data, error } = await this.supabase
      .from('ai_prompt_versions')
      .select('*')
      .is('organization_id', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return { items: data };
  }

  @Post()
  async createPrompt(@Body() body: any) {
    const { data, error } = await this.supabase
      .from('ai_prompt_versions')
      .insert({
        agent: body.agent,
        name: body.name,
        description: body.description,
        system_prompt: body.systemPrompt,
        user_prompt_template: body.userPromptTemplate,
        output_schema: body.outputSchema,
        model_preferences: body.modelPreferences,
        is_active: body.isActive,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    
    // If it's active, we should deactivate others for this agent
    if (body.isActive) {
      await this.supabase
        .from('ai_prompt_versions')
        .update({ is_active: false })
        .is('organization_id', null)
        .eq('agent', body.agent)
        .neq('id', data.id);
    }

    return { success: true, item: data };
  }
}
