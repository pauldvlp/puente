import { z } from 'zod';

/**
 * Alerting — a puente Pro capability (`alerts`). Contracts live here in the free package because
 * the frontend needs them to render the upgrade state; the implementation is under `ee/`.
 */

export const ALERT_CHANNEL_KINDS = ['webhook', 'slack', 'discord'] as const;
export const AlertChannelKindSchema = z.enum(ALERT_CHANNEL_KINDS);
export type AlertChannelKind = z.infer<typeof AlertChannelKindSchema>;

/** What can wake someone up. Recoveries are included: a down alert with no all-clear is noise. */
export const ALERT_TRIGGERS = ['node.down', 'node.up', 'route.down', 'route.up'] as const;
export const AlertTriggerSchema = z.enum(ALERT_TRIGGERS);
export type AlertTrigger = z.infer<typeof AlertTriggerSchema>;

export const DEFAULT_TRIGGERS: AlertTrigger[] = [...ALERT_TRIGGERS];

/**
 * Minimum gap between two notifications about the same thing on the same channel. Health is polled
 * every 30s by default; a flapping tunnel without this would send thousands of messages a day.
 */
export const ALERT_COOLDOWN_MINUTES = 10;

const httpsUrl = z
  .string()
  .url('Enter the full URL the provider gave you, starting with https://')
  .refine((u) => u.startsWith('https://') || u.startsWith('http://'), {
    message: 'The URL must start with https:// or http://',
  });

export const AlertChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: AlertChannelKindSchema,
  /**
   * Host plus a truncated path — never the full URL. A Slack or Discord webhook URL *is* the
   * credential, so the API must not hand it back once stored.
   */
  urlPreview: z.string(),
  enabled: z.boolean(),
  triggers: z.array(AlertTriggerSchema),
  lastDeliveryAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AlertChannel = z.infer<typeof AlertChannelSchema>;

export const CreateAlertChannelSchema = z.object({
  name: z.string().min(1, 'Give the channel a name you will recognise.').max(60),
  kind: AlertChannelKindSchema,
  url: httpsUrl,
  triggers: z.array(AlertTriggerSchema).min(1, 'Pick at least one thing to be told about.'),
  enabled: z.boolean().default(true),
});
export type CreateAlertChannelInput = z.infer<typeof CreateAlertChannelSchema>;

export const UpdateAlertChannelSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  url: httpsUrl.optional(),
  triggers: z.array(AlertTriggerSchema).min(1).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateAlertChannelInput = z.infer<typeof UpdateAlertChannelSchema>;

/** Result of firing a channel — used by the "send test" button and surfaced on failures. */
export const AlertDeliverySchema = z.object({
  ok: z.boolean(),
  httpStatus: z.number().int().nullable(),
  message: z.string(),
});
export type AlertDelivery = z.infer<typeof AlertDeliverySchema>;

/** The body posted to a `webhook` channel. Stable shape — people will parse this. */
export const AlertPayloadSchema = z.object({
  /** Payload format version, so a consumer can branch safely if this ever grows. */
  v: z.literal(1),
  trigger: AlertTriggerSchema,
  /** Human-readable one-liner, the same text used for Slack and Discord. */
  text: z.string(),
  severity: z.enum(['critical', 'ok']),
  subject: z.object({
    kind: z.enum(['node', 'route']),
    id: z.string(),
    name: z.string(),
  }),
  /** Previous → current state, verbatim from puente's own vocabulary. */
  from: z.string().nullable(),
  to: z.string(),
  at: z.string(),
});
export type AlertPayload = z.infer<typeof AlertPayloadSchema>;

export const TRIGGER_LABELS: Record<AlertTrigger, string> = {
  'node.down': 'A node goes down',
  'node.up': 'A node recovers',
  'route.down': 'A route stops answering',
  'route.up': 'A route recovers',
};
