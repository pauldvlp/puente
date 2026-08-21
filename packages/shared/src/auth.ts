import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** First-run: create the single admin account for this control plane. */
export const RegisterAdminSchema = z
  .object({
    username: z.string().min(3).max(40),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterAdminInput = z.infer<typeof RegisterAdminSchema>;

/**
 * Who can do what. Roles exist in the free edition too — with a single account there is nothing
 * to separate, so Community always has one owner and never notices. What Pro sells is the second
 * account, not the concept.
 */
export const ROLES = ['owner', 'operator', 'viewer'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including licensing, teammates and deleting nodes.',
  operator: 'Day-to-day work: add nodes, publish and check routes.',
  viewer: 'Read-only. Can see everything, can change nothing.',
};

/** Ranked, so a check is a comparison rather than a list of cases. */
export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 };

export const SessionUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: RoleSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

/** A teammate as the panel lists them. Never carries the password hash. */
export const TeamMemberSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: RoleSchema,
  createdAt: z.string(),
  /** True for the account making the request — the UI refuses to let you demote yourself. */
  isYou: z.boolean(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const CreateTeamMemberSchema = z.object({
  username: z
    .string()
    .min(3, 'At least 3 characters.')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only.'),
  password: z.string().min(8, 'Use at least 8 characters'),
  role: RoleSchema,
});
export type CreateTeamMemberInput = z.infer<typeof CreateTeamMemberSchema>;

export const UpdateTeamMemberSchema = z.object({
  role: RoleSchema.optional(),
  password: z.string().min(8, 'Use at least 8 characters').optional(),
});
export type UpdateTeamMemberInput = z.infer<typeof UpdateTeamMemberSchema>;

/** Error codes the panel branches on rather than matching prose. */
export const SEATS_EXHAUSTED = 'SEATS_EXHAUSTED';
export const LAST_OWNER = 'LAST_OWNER';

export const AuthTokenSchema = z.object({
  token: z.string(),
  user: SessionUserSchema,
});
export type AuthToken = z.infer<typeof AuthTokenSchema>;
