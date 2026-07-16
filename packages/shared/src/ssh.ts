import { z } from 'zod';

export const SshAuthMethodSchema = z.enum(['key', 'password', 'agent']);
export type SshAuthMethod = z.infer<typeof SshAuthMethodSchema>;

/** Non-secret SSH connection descriptor persisted for a remote node. */
export const SshConfigSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  authMethod: SshAuthMethodSchema.default('key'),
  /** Absolute path to the private key used for this host (managed or user-provided). */
  privateKeyPath: z.string().nullable().optional(),
  /** Whether this node uses a puente-managed dedicated key (created during bootstrap). */
  managedKey: z.boolean().default(false),
  /** Pinned SHA-256 fingerprint of the host key (set after first successful connect). */
  hostKeyFingerprint: z.string().nullable().optional(),
});
export type SshConfig = z.infer<typeof SshConfigSchema>;

/** A host alias parsed from the operator's ~/.ssh/config. */
export const SshConfigHostSchema = z.object({
  alias: z.string(),
  hostName: z.string().nullable(),
  user: z.string().nullable(),
  port: z.number().nullable(),
  identityFile: z.string().nullable(),
});
export type SshConfigHost = z.infer<typeof SshConfigHostSchema>;

/** A private/public key pair managed by puente (paths only, never the secret). */
export const SshKeySchema = z.object({
  name: z.string(),
  path: z.string(),
  publicKey: z.string(),
  type: z.string(),
  managed: z.boolean(),
});
export type SshKey = z.infer<typeof SshKeySchema>;

/** Input to bootstrap passwordless auth against a host using a one-time password. */
export const SshBootstrapSchema = z.object({
  password: z.string().min(1),
  /** Generate a dedicated managed ed25519 key for this host (recommended). */
  useManagedKey: z.boolean().default(true),
});
export type SshBootstrapInput = z.infer<typeof SshBootstrapSchema>;

export const SshTestResultSchema = z.object({
  ok: z.boolean(),
  reachable: z.boolean(),
  authenticated: z.boolean(),
  os: z.string().nullable(),
  arch: z.string().nullable(),
  hostname: z.string().nullable(),
  passwordlessSudo: z.boolean().nullable(),
  cloudflaredVersion: z.string().nullable(),
  hostKeyFingerprint: z.string().nullable(),
  message: z.string(),
});
export type SshTestResult = z.infer<typeof SshTestResultSchema>;
