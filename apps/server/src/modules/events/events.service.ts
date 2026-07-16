import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import type { ActivityEvent, EventLevel } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { EventBus } from '../../common/event-bus.service';
import { events, type EventRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs, toIsoStrict } from '../../common/time';

interface LogOptions {
  nodeId?: string | null;
  routeId?: string | null;
  meta?: Record<string, unknown> | null;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly dbs: DbService,
    private readonly bus: EventBus,
  ) {}

  log(level: EventLevel, action: string, message: string, opts: LogOptions = {}): ActivityEvent {
    const row: EventRow = {
      id: newId('evt'),
      ts: nowMs(),
      level,
      action,
      message,
      nodeId: opts.nodeId ?? null,
      routeId: opts.routeId ?? null,
      meta: opts.meta ?? null,
    };
    this.dbs.db.insert(events).values(row).run();
    const event = this.toDto(row);
    this.bus.emit({ type: 'event', event });
    return event;
  }

  info(action: string, message: string, opts?: LogOptions) {
    return this.log('info', action, message, opts);
  }
  success(action: string, message: string, opts?: LogOptions) {
    return this.log('success', action, message, opts);
  }
  warn(action: string, message: string, opts?: LogOptions) {
    return this.log('warn', action, message, opts);
  }
  error(action: string, message: string, opts?: LogOptions) {
    return this.log('error', action, message, opts);
  }

  list(limit = 150): ActivityEvent[] {
    return this.dbs.db
      .select()
      .from(events)
      .orderBy(desc(events.ts))
      .limit(limit)
      .all()
      .map((r) => this.toDto(r));
  }

  private toDto(r: EventRow): ActivityEvent {
    return {
      id: r.id,
      ts: toIsoStrict(r.ts),
      level: r.level as EventLevel,
      action: r.action,
      message: r.message,
      nodeId: r.nodeId,
      routeId: r.routeId,
      meta: r.meta ?? null,
    };
  }
}
