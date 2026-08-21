import { z } from 'zod';

export const EventLevelSchema = z.enum(['info', 'success', 'warn', 'error']);
export type EventLevel = z.infer<typeof EventLevelSchema>;

/** A persisted audit/activity log entry. */
export const ActivityEventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  /** Who caused it. Null for anything puente did on its own, and for rows written before 0.5. */
  username: z.string().nullable(),
  level: EventLevelSchema,
  action: z.string(),
  message: z.string(),
  nodeId: z.string().nullable(),
  routeId: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

/** Filters for the activity feed. Everything is optional; nothing here is behind a licence. */
export const EventQuerySchema = z.object({
  level: EventLevelSchema.optional(),
  /** Prefix match on the action, e.g. `route.` for everything routes did. */
  action: z.string().max(60).optional(),
  username: z.string().max(40).optional(),
  /** Free text over the message. */
  search: z.string().max(120).optional(),
  /** Epoch millis; returns entries strictly older, which is how the feed pages backwards. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(150),
});
export type EventQuery = z.infer<typeof EventQuerySchema>;
/** What a caller may send: `limit` has a default, so it is optional on the way in. */
export type EventQueryInput = z.input<typeof EventQuerySchema>;

export const EXPORT_FORMATS = ['csv', 'json'] as const;
export const ExportFormatSchema = z.enum(EXPORT_FORMATS);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
