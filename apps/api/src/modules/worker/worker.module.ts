import { Module } from '@nestjs/common';
import { WorkerProcessorService } from './worker.service';

@Module({
  providers: [WorkerProcessorService],
})
export class WorkerModule {}
