import { z } from 'zod';

/**
 * puente is open core. Everything in this file describes the boundary between the free
 * AGPL edition and the paid one — see LICENSING.md at the repository root.
 *
 * A license key is verified **offline**, against a public key embedded in the binary. puente
 * never phones home, at any edition.
 */

/** Paid capabilities. A key carries the exact list it unlocks, so plans stay a label. */
export const PRO_FEATURES = [
  /** More than one user account, with roles (owner / operator / viewer). */
  'team',
  /** Sign in through an external OIDC provider. */
  'sso',
  /** Immutable, exportable audit trail with retention beyond the rolling window. */
  'audit',
  /** Scheduled backups of the puente database and restore from them. */
  'backup',
  /** Notify a webhook / email / chat channel when a node or route degrades. */
  'alerts',
  /** Several Cloudflare accounts side by side, isolated per client workspace. */
  'workspaces',
  /** API tokens for automation and CI. */
  'api',
  /** Fleet operations: upgrade or reconfigure many nodes in one action. */
  'fleet',
] as const;

export const ProFeatureSchema = z.enum(PRO_FEATURES);
export type ProFeature = z.infer<typeof ProFeatureSchema>;

export const EDITIONS = ['community', 'pro'] as const;
export const EditionSchema = z.enum(EDITIONS);
export type Edition = z.infer<typeof EditionSchema>;

/** Marketing label carried by the key. The feature list, not this, decides what unlocks. */
export const PLANS = ['pro', 'agency', 'enterprise'] as const;
export const PlanSchema = z.enum(PLANS);
export type Plan = z.infer<typeof PlanSchema>;

/** The signed payload inside a license key. Keep it small — it travels base64 in one string. */
export const LicensePayloadSchema = z.object({
  /** Payload format version. */
  v: z.literal(1),
  /** Unique license id, so a key can be revoked and re-issued. */
  id: z.string().min(1),
  /** Legal entity the license is granted to. */
  licensee: z.string().min(1),
  email: z.string().email(),
  plan: PlanSchema,
  features: z.array(ProFeatureSchema),
  /** Seat cap for the `team` feature. null = unlimited. */
  seats: z.number().int().positive().nullable(),
  /** Node cap. null = unlimited (the default: capping nodes punishes the core use case). */
  nodes: z.number().int().positive().nullable(),
  /** Epoch millis. */
  issuedAt: z.number().int(),
  /** Epoch millis. A perpetual key uses null. */
  expiresAt: z.number().int().nullable(),
});
export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

/**
 * Days a key keeps working after it expires. An expired subscription must never take a
 * production tunnel down: the grace window ends in Pro features going quiet, nothing else.
 */
export const LICENSE_GRACE_DAYS = 14;

export const LICENSE_KEY_PREFIX = 'puente-lic-v1';

/** Why a key was rejected — surfaced verbatim in the UI, so keep the wording user-facing. */
export const LicenseProblemSchema = z.enum([
  'malformed',
  'bad-signature',
  'unsupported-version',
  'expired',
]);
export type LicenseProblem = z.infer<typeof LicenseProblemSchema>;

/** What `GET /api/license` answers. Safe to show to any signed-in user. */
export const LicenseStatusSchema = z.object({
  edition: EditionSchema,
  /** Null on Community. */
  licensee: z.string().nullable(),
  plan: PlanSchema.nullable(),
  features: z.array(ProFeatureSchema),
  seats: z.number().int().positive().nullable(),
  nodes: z.number().int().positive().nullable(),
  expiresAt: z.string().nullable(),
  /** True while the key is past `expiresAt` but still inside the grace window. */
  inGrace: z.boolean(),
  /** Days left before the key expires, or before grace runs out. Null when perpetual. */
  daysRemaining: z.number().int().nullable(),
  /** Set when a stored key stopped verifying, so the UI can explain itself. */
  problem: LicenseProblemSchema.nullable(),
});
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export const ActivateLicenseSchema = z.object({
  key: z.string().min(1, 'Paste the license key you received by email.'),
});
export type ActivateLicenseInput = z.infer<typeof ActivateLicenseSchema>;

/** Shown wherever a Pro-only affordance is displayed to a Community user. */
export const UPGRADE_URL = 'https://puente.dev/pricing';

export const COMMUNITY_STATUS: LicenseStatus = {
  edition: 'community',
  licensee: null,
  plan: null,
  features: [],
  seats: null,
  nodes: null,
  expiresAt: null,
  inGrace: false,
  daysRemaining: null,
  problem: null,
};
