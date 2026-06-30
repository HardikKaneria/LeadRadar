import { Module, Global } from '@nestjs/common';
import { SupabaseQueueService } from './supabase-queue.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Global()
@Module({
  imports: [SupabaseModule],
  providers: [SupabaseQueueService],
  exports: [SupabaseQueueService],
})
export class QueueModule {}
