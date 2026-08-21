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

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Give the workspace the client or team name you will recognise.').max(60),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(60),
});
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

/** What `DELETE` refuses to do, and why — surfaced verbatim so the UI can explain itself. */
export const WORKSPACE_NOT_EMPTY = 'WORKSPACE_NOT_EMPTY';
export const WORKSPACE_LAST_ONE = 'WORKSPACE_LAST_ONE';
