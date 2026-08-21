import { describe, it, expect } from 'vitest';
import type {
  ConnectorRunState,
  ProvisionState,
  RouteHealth,
  RouteStatus,
  TunnelStatus,
} from '@puente/shared';
import {
  connectorStateMeta,
  provisionMeta,
  routeHealthMeta,
  routeStatusMeta,
  tunnelStatusMeta,
} from './status';

/**
 * These read values straight out of the user's SQLite file, so the TypeScript union is a
 * description of what *should* be there, not a guarantee. A row written by a newer puente, an
 * interrupted migration or a hand-edited database all arrive here as a string nobody planned for.
 *
 * `routeStatusMeta` used to have no default branch: it returned undefined and the panel rendered a
 * blank screen, which reads to a user as "puente is broken", not "one badge is wrong".
 */
const UNEXPECTED = 'something-from-the-future';

describe('status metadata', () => {
  it.each([
    ['tunnelStatusMeta', () => tunnelStatusMeta(UNEXPECTED as TunnelStatus)],
    ['connectorStateMeta', () => connectorStateMeta(UNEXPECTED as ConnectorRunState)],
    ['provisionMeta', () => provisionMeta(UNEXPECTED as ProvisionState)],
    ['routeStatusMeta', () => routeStatusMeta(UNEXPECTED as RouteStatus)],
    ['routeHealthMeta', () => routeHealthMeta(UNEXPECTED as RouteHealth)],
  ])('%s survives a value it has never seen', (_name, call) => {
    const meta = call();
    expect(meta).toBeDefined();
    expect(meta.tone).toBeTruthy();
    expect(meta.label).toBeTruthy();
  });

  it('still labels the states it does know', () => {
    expect(routeStatusMeta('active')).toEqual({ label: 'Active', tone: 'ok' });
    expect(routeStatusMeta('disabled')).toEqual({ label: 'Disabled', tone: 'neutral' });
    expect(tunnelStatusMeta('healthy').tone).toBe('ok');
    expect(routeHealthMeta('unhealthy').tone).toBe('danger');
  });

  it('treats a null tunnel status as unknown rather than crashing', () => {
    expect(tunnelStatusMeta(null)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });
});
