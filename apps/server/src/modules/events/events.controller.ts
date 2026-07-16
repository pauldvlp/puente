import { Controller, Get, Query } from '@nestjs/common';
import type { ActivityEvent } from '@puente/shared';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query('limit') limit?: string): ActivityEvent[] {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 150, 1), 500) : 150;
    return this.events.list(n);
  }
}
