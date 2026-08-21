import { Controller, Get, Query } from '@nestjs/common';
import { EventQuerySchema, type ActivityEvent, type EventQuery } from '@puente/shared';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Filtering is free. A log you cannot search is not a log, and Community has had this feed
   * since the first release — narrowing it would be taking something away. Getting the records
   * out of puente is the paid part; see ee/audit.
   */
  @Get()
  list(@Query() raw: Record<string, string>): ActivityEvent[] {
    const parsed = EventQuerySchema.safeParse(raw);
    const query: Partial<EventQuery> = parsed.success ? parsed.data : {};
    return this.events.query(query);
  }
}
