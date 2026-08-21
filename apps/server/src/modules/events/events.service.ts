import { Injectable } from '@nestjs/common';
import { and, desc, eq, like, lt, type SQL } from 'drizzle-orm';
import type { ActivityEvent, EventLevel, EventQuery } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { EventBus } from '../../common/event-bus.service';
import { ActorContext } from '../../common/actor.service';
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
    private readonly actor: ActorContext,
  ) {}

  log(level: EventLevel, action: string, message: string, opts: LogOptions = {}): ActivityEvent {
    const who = this.actor.current();
    const row: EventRow = {
      id: newId('evt'),
      ts: nowMs(),
      userId: who?.id ?? null,
      username: who?.username ?? null,
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
    return this.query({ limit });
  }

  /**
   * The activity feed, filtered. Deliberately free: a log you cannot search is not a log, and
   * taking search away from Community would make the free edition worse than it is today.
   * What Pro sells is getting the records *out* — see ee/audit.
   */
  query(q: Partial<EventQuery>): ActivityEvent[] {
    const conditions: SQL[] = [];
    if (q.level) conditions.push(eq(events.level, q.level));
    if (q.action) conditions.push(like(events.action, `${q.action}%`));
    if (q.username) conditions.push(eq(events.username, q.username));
    if (q.search) conditions.push(like(events.message, `%${q.search}%`));
    if (q.before) conditions.push(lt(events.ts, q.before));

    const base = this.dbs.db.select().from(events);
    const filtered = conditions.length ? base.where(and(...conditions)) : base;
    return filtered
      .orderBy(desc(events.ts))
      .limit(q.limit ?? 150)
      .all()
      .map((r) => this.toDto(r));
  }

  /** Everything matching, oldest first — the shape an export or an auditor wants. */
  all(q: Partial<EventQuery> = {}): ActivityEvent[] {
    return this.query({ ...q, limit: 500 }).reverse();
  }

  private toDto(r: EventRow): ActivityEvent {
    return {
      id: r.id,
      ts: toIsoStrict(r.ts),
      username: r.username,
      level: r.level as EventLevel,
      action: r.action,
      message: r.message,
      nodeId: r.nodeId,
      routeId: r.routeId,
      meta: r.meta ?? null,
    };
  }
}
