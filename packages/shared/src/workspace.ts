import { z } from 'zod';

/**
 * A workspace is one Cloudflare account and everything published through it. Every install has
 * exactly one until Pro unlocks more, so Community sees this concept only as a label.
 */
export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  cloudflareConnected: z.boolean(),
  cloudflareAccountName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Header the panel uses to say which workspace a request is for. */
export const WORKSPACE_HEADER = 'x-puente-workspace';
