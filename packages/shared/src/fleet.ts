import { z } from 'zod';

/**
 * Fleet operations — a puente Agency capability (`fleet`).
 *
 * Doing something to one node is free. Doing it to twenty, one at a time, with a report at the
 * end, is what an agency is paying for.
 */

export const FLEET_OPERATIONS = ['upgrade', 'restart'] as const;
export const FleetOperationSchema = z.enum(FLEET_OPERATIONS);
export type FleetOperation = z.infer<typeof FleetOperationSchema>;

export const FLEET_OPERATION_LABELS: Record<FleetOperation, string> = {
  upgrade: 'Update the connector',
  restart: 'Restart the connector',
};

export const RunFleetOperationSchema = z.object({
  operation: FleetOperationSchema,
  /** Omit to mean every node in the current workspace. */
  nodeIds: z.array(z.string()).optional(),
});
export type RunFleetOperationInput = z.infer<typeof RunFleetOperationSchema>;

export const FleetResultSchema = z.object({
  nodeId: z.string(),
  name: z.string(),
  ok: z.boolean(),
  message: z.string(),
});
export type FleetResult = z.infer<typeof FleetResultSchema>;

export const FleetRunSchema = z.object({
  operation: FleetOperationSchema,
  startedAt: z.string(),
  finishedAt: z.string(),
  results: z.array(FleetResultSchema),
  succeeded: z.number().int(),
  failed: z.number().int(),
});
export type FleetRun = z.infer<typeof FleetRunSchema>;
