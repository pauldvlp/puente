import { z } from 'zod';
import { RoleSchema } from './auth.js';

/**
 * Single sign-on over OIDC — a puente Enterprise capability (`sso`).
 *
 * Configuring it is what the licence gates. Signing in with an identity provider that is already
 * configured keeps working regardless, for the same reason API tokens do: locking a company out
 * of its own panel over an invoice is an outage, not a sales tactic.
 */

/** What the login screen needs, before anyone has authenticated. Deliberately says nothing else. */
export const SsoStatusSchema = z.object({
  enabled: z.boolean(),
  /** Label for the button, e.g. "Okta" or "Google". */
  label: z.string(),
});
export type SsoStatus = z.infer<typeof SsoStatusSchema>;

export const SsoConfigSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  /** e.g. https://accounts.google.com — endpoints come from its discovery document. */
  issuer: z.string(),
  clientId: z.string(),
  /** True once a secret is stored. The secret itself is never returned. */
  hasClientSecret: z.boolean(),
  /** Only sign in people whose email ends in this domain. Empty means any. */
  allowedDomain: z.string(),
  /** Role given to someone signing in for the first time. */
  defaultRole: RoleSchema,
  /** The URL to register with the identity provider. */
  redirectUri: z.string(),
  lastError: z.string().nullable(),
});
export type SsoConfig = z.infer<typeof SsoConfigSchema>;

export const UpdateSsoConfigSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().min(1).max(40).optional(),
  issuer: z
    .string()
    .url('Use the issuer URL your provider gives you, e.g. https://accounts.google.com')
    .optional(),
  clientId: z.string().min(1).optional(),
  /** Omit to keep the stored one; send "" to clear it. */
  clientSecret: z.string().optional(),
  allowedDomain: z.string().max(255).optional(),
  defaultRole: RoleSchema.optional(),
});
export type UpdateSsoConfigInput = z.infer<typeof UpdateSsoConfigSchema>;

/** Exchanges the one-time code from the callback for a session token. */
export const SsoExchangeSchema = z.object({
  code: z.string().min(1),
});
export type SsoExchangeInput = z.infer<typeof SsoExchangeSchema>;

export const SSO_NOT_CONFIGURED = 'SSO_NOT_CONFIGURED';
export const SSO_DOMAIN_REFUSED = 'SSO_DOMAIN_REFUSED';
