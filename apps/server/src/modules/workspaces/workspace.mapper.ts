import type { Workspace } from '@puente/shared';
import type { WorkspaceRow } from '../../db/schema';
import { toIsoStrict } from '../../common/time';

/** Never exposes the encrypted token — only whether there is one. */
export function toWorkspaceDto(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    cloudflareConnected: Boolean(row.cloudflareApiTokenEnc || row.cloudflareAuthMode === 'cert'),
    cloudflareAccountName: row.cloudflareAccountName,
    createdAt: toIsoStrict(row.createdAt),
    updatedAt: toIsoStrict(row.updatedAt),
  };
}
