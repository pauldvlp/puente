import { z } from 'zod';

/** How the app authenticates against the Cloudflare API. */
export const CloudflareAuthModeSchema = z.enum(['token', 'cert']);
export type CloudflareAuthMode = z.infer<typeof CloudflareAuthModeSchema>;

/** The four exact tunnel health states returned by the Cloudflare API. */
export const TunnelStatusSchema = z.enum(['inactive', 'degraded', 'healthy', 'down']);
export type TunnelStatus = z.infer<typeof TunnelStatusSchema>;

/** Payload to connect the app to a Cloudflare account via a scoped API token. */
export const ConnectTokenSchema = z.object({
  apiToken: z.string().min(20, 'The API token looks too short'),
  /** Optional explicit account id; auto-discovered when omitted. */
  accountId: z.string().optional(),
});
export type ConnectTokenInput = z.infer<typeof ConnectTokenSchema>;

export const CloudflareAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
});
export type CloudflareAccount = z.infer<typeof CloudflareAccountSchema>;

export const CloudflareZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string().optional(),
  accountId: z.string().optional(),
});
export type CloudflareZone = z.infer<typeof CloudflareZoneSchema>;

/** Result of verifying/connecting a Cloudflare token. */
export const CloudflareConnectionSchema = z.object({
  connected: z.boolean(),
  authMode: CloudflareAuthModeSchema.nullable(),
  tokenStatus: z.enum(['active', 'disabled', 'expired', 'unknown']).nullable(),
  account: CloudflareAccountSchema.nullable(),
  accounts: z.array(CloudflareAccountSchema).default([]),
  zones: z.array(CloudflareZoneSchema).default([]),
});
export type CloudflareConnection = z.infer<typeof CloudflareConnectionSchema>;

/**
 * The exact API Token permission groups a user must select in the Cloudflare
 * dashboard. Surfaced verbatim in the setup UI so the user can copy them.
 */
export const REQUIRED_TOKEN_SCOPES = [
  {
    category: 'Account',
    group: 'Cloudflare Tunnel',
    access: 'Edit',
    reason: 'Create, configure and delete tunnels and their ingress rules',
  },
  {
    category: 'Zone',
    group: 'DNS',
    access: 'Edit',
    reason: 'Create the proxied CNAME records that route subdomains to tunnels',
  },
  {
    category: 'Zone',
    group: 'Zone',
    access: 'Read',
    reason: 'List your domains (zones) so you can pick where to publish',
  },
  {
    category: 'Account',
    group: 'Account Settings',
    access: 'Read',
    reason: 'Discover your account id automatically',
  },
] as const;
