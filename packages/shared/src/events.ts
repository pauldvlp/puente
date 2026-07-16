import { z } from 'zod';

export const EventLevelSchema = z.enum(['info', 'success', 'warn', 'error']);
export type EventLevel = z.infer<typeof EventLevelSchema>;

/** A persisted audit/activity log entry. */
export const ActivityEventSchema = z.object({
  id: z.string(),
  ts: z.string(),
  level: EventLevelSchema,
  action: z.string(),
  message: z.string(),
  nodeId: z.string().nullable(),
  routeId: z.string().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
