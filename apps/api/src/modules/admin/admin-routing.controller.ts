import { Controller, Get, Put, Param, Body, Inject, UseGuards, InternalServerErrorException } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@UseGuards(PlatformAdminGuard)
@Controller('admin/routing')
export class AdminRoutingController {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  @Get()
  async getRoutes() {
    const { data, error } = await this.supabase
      .from('ai_task_routes')
      .select('*')
      .order('task_type');

    if (error) throw new Error(error.message);
    return { items: data };
  }

  @Put(':taskType')
  async updateRoute(
    @Param('taskType') taskType: string,
    @Body() body: any,
  ) {
    const updatePayload = {
      primary_provider: body.primary_provider,
      primary_model: body.primary_model,
      fallback_provider: body.fallback_provider || null,
      fallback_model: body.fallback_model || null,
      fallback_2_provider: body.fallback_2_provider || null,
      fallback_2_model: body.fallback_2_model || null,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await this.supabase
      .from('ai_task_routes')
      .update(updatePayload)
      .eq('task_type', taskType);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    return { success: true };
  }
}
