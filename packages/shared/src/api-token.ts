import { z } from 'zod';
import { RoleSchema } from './auth.js';

/**
 * API tokens — a puente Pro capability (`api`).
 *
 * A token authenticates like a user and carries a role, so everything the roles guard already
 * enforces applies to it unchanged: a viewer token can read and nothing else.
 */

/** Every token starts with this, so one can be spotted in a log or a config file. */
export const API_TOKEN_PREFIX = 'pnt_';

export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: RoleSchema,
  /** First few characters, to tell tokens apart. The rest is never stored in a readable form. */
  hint: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const CreateApiTokenSchema = z.object({
  name: z.string().min(1, 'Name it after what will use it.').max(60),
  role: RoleSchema,
  /** Days until it stops working. Omit for a token that never expires. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenSchema>;

/** The one and only time the secret is returned. */
export const CreatedApiTokenSchema = ApiTokenSchema.extend({
  token: z.string(),
});
export type CreatedApiToken = z.infer<typeof CreatedApiTokenSchema>;
