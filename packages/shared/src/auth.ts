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

export const SessionUserSchema = z.object({
  id: z.string(),
  username: z.string(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const AuthTokenSchema = z.object({
  token: z.string(),
  user: SessionUserSchema,
});
export type AuthToken = z.infer<typeof AuthTokenSchema>;
