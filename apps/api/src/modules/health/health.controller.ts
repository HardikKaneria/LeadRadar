import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ServiceClient } from '@radar/supabase';
import { Public } from '../../common/decorators/public.decorator';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  @Public()
  @Get()
  async check() {
    let db = 'ok';
    try {
      const { error } = await this.supabase.from('permissions').select('key').limit(1);
      if (error) db = 'error';
    } catch {
      db = 'error';
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString() };
  }
}
