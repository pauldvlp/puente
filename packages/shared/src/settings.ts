import { z } from 'zod';
import { CloudflareConnectionSchema } from './cloudflare.js';

/** Overall bootstrap status the frontend uses to route the setup wizard. */
export const SetupStatusSchema = z.object({
  /** An admin account exists. */
  hasAdmin: z.boolean(),
  /** Cloudflare is connected (token or cert). */
  cloudflareConnected: z.boolean(),
  /** At least one node exists. */
  hasNodes: z.boolean(),
  /** Everything required to be operational is configured. */
  ready: z.boolean(),
  version: z.string(),
});
export type SetupStatus = z.infer<typeof SetupStatusSchema>;

export const AppSettingsSchema = z.object({
  cloudflare: CloudflareConnectionSchema,
  /** Where puente stores managed SSH keys and the local cloudflared binary. */
  dataDir: z.string(),
  /** Preferred zone id to default new routes to. */
  defaultZoneId: z.string().nullable(),
  /** Poll interval (seconds) for connector/route health. */
  healthPollSeconds: z.number().int().min(5).max(3600),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const UpdateSettingsSchema = z.object({
  defaultZoneId: z.string().nullable().optional(),
  healthPollSeconds: z.number().int().min(5).max(3600).optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
