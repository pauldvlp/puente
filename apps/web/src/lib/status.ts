import type {
  ConnectorRunState,
  Node as PuenteNode,
  ProvisionState,
  RouteHealth,
  RouteStatus,
  TunnelStatus,
} from '@puente/shared';

export type Tone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral';

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export function tunnelStatusMeta(s: TunnelStatus | null): StatusMeta {
  switch (s) {
    case 'healthy':
      return { label: 'Healthy', tone: 'ok' };
    case 'degraded':
      return { label: 'Degraded', tone: 'warn' };
    case 'down':
      return { label: 'Down', tone: 'danger' };
    case 'inactive':
      return { label: 'Inactive', tone: 'neutral' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

export function connectorStateMeta(s: ConnectorRunState): StatusMeta {
  switch (s) {
    case 'running':
      return { label: 'Running', tone: 'ok' };
    case 'stopped':
      return { label: 'Stopped', tone: 'neutral' };
    case 'error':
      return { label: 'Error', tone: 'danger' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

export function provisionMeta(s: ProvisionState): StatusMeta {
  switch (s) {
    case 'provisioned':
      return { label: 'Provisioned', tone: 'ok' };
    case 'provisioning':
      return { label: 'Provisioning', tone: 'brand' };
    case 'error':
      return { label: 'Error', tone: 'danger' };
    default:
      return { label: 'Not set up', tone: 'neutral' };
  }
}

export function routeStatusMeta(s: RouteStatus): StatusMeta {
  switch (s) {
    case 'active':
      return { label: 'Active', tone: 'ok' };
    case 'pending':
      return { label: 'Pending', tone: 'warn' };
    case 'error':
      return { label: 'Error', tone: 'danger' };
    case 'disabled':
      return { label: 'Disabled', tone: 'neutral' };
  }
}

export function routeHealthMeta(h: RouteHealth): StatusMeta {
  switch (h) {
    case 'healthy':
      return { label: 'Healthy', tone: 'ok' };
    case 'unhealthy':
      return { label: 'Unhealthy', tone: 'danger' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

/** The single most relevant status to show for a node at a glance. */
export function nodeHeadlineMeta(node: PuenteNode): StatusMeta {
  if (node.provisionState === 'provisioning') return { label: 'Provisioning', tone: 'brand' };
  if (node.provisionState === 'error') return { label: 'Error', tone: 'danger' };
  if (node.provisionState === 'unprovisioned') return { label: 'Not set up', tone: 'neutral' };
  return tunnelStatusMeta(node.tunnelStatus);
}
