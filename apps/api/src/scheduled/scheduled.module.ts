import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ScheduledTasksService],
})
export class ScheduledModule {}
