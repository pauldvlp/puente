import type { Node, SshConfig, TunnelStatus } from '@puente/shared';
import type { NodeRow } from '../../db/schema';
import { toIso, toIsoStrict } from '../../common/time';

export function toNodeDto(row: NodeRow): Node {
  const ssh: SshConfig | null =
    row.kind === 'ssh' && row.sshHost
      ? {
          host: row.sshHost,
          port: row.sshPort ?? 22,
          username: row.sshUsername ?? '',
          authMethod: (row.sshAuthMethod as SshConfig['authMethod']) ?? 'key',
          privateKeyPath: row.sshPrivateKeyPath,
          managedKey: Boolean(row.sshManagedKey),
          hostKeyFingerprint: row.sshHostKeyFingerprint,
        }
      : null;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Node['kind'],
    ssh,
    tunnelId: row.tunnelId,
    tunnelName: row.tunnelName,
    provisionState: row.provisionState as Node['provisionState'],
    connectorRunState: row.connectorRunState as Node['connectorRunState'],
    tunnelStatus: (row.tunnelStatus as TunnelStatus | null) ?? null,
    serviceInstalled: Boolean(row.serviceInstalled),
    os: row.os,
    arch: row.arch,
    cloudflaredVersion: row.cloudflaredVersion,
    connectionCount: row.connectionCount,
    lastError: row.lastError,
    lastSeenAt: toIso(row.lastSeenAt),
    createdAt: toIsoStrict(row.createdAt),
    updatedAt: toIsoStrict(row.updatedAt),
  };
}
