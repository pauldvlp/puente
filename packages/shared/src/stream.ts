import { z } from 'zod';
import { NodeSchema } from './node.js';
import { RouteSchema } from './route.js';
import { ActivityEventSchema } from './events.js';

/**
 * Server-Sent-Events payloads pushed on /api/stream. A discriminated union so
 * the frontend can update the right slice of state without polling.
 */
export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), at: z.string() }),
  z.object({ type: z.literal('ping'), at: z.string() }),
  z.object({ type: z.literal('node.updated'), node: NodeSchema }),
  z.object({ type: z.literal('node.deleted'), nodeId: z.string() }),
  z.object({ type: z.literal('route.updated'), route: RouteSchema }),
  z.object({ type: z.literal('route.deleted'), routeId: z.string() }),
  z.object({ type: z.literal('event'), event: ActivityEventSchema }),
  z.object({
    type: z.literal('progress'),
    /** Correlates to a long-running job, e.g. `provision:<nodeId>`. */
    scope: z.string(),
    step: z.string(),
    message: z.string(),
    done: z.boolean(),
    error: z.boolean().default(false),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
