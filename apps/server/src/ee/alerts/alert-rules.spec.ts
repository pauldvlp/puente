import { describe, it, expect } from 'vitest';
import { ALERT_COOLDOWN_MINUTES } from '@puente/shared';
import type { HealthChangedFact } from '../../common/facts';
import {
  buildPayload,
  classify,
  describe as describeFact,
  inCooldown,
  severityOf,
} from './alert-rules';

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const MINUTE = 60_000;

const fact = (over: Partial<HealthChangedFact> = {}): HealthChangedFact => ({
  type: 'health.changed',
  subject: 'node',
  id: 'node_1',
  name: 'vps-fra',
  from: 'healthy',
  to: 'down',
  at: NOW,
  ...over,
});

describe('classify', () => {
  it('alerts when a healthy node goes down or degrades', () => {
    expect(classify(fact({ to: 'down' }))).toBe('node.down');
    expect(classify(fact({ to: 'degraded' }))).toBe('node.down');
  });

  it('alerts when a node comes back', () => {
    expect(classify(fact({ from: 'down', to: 'healthy' }))).toBe('node.up');
    expect(classify(fact({ from: 'degraded', to: 'healthy' }))).toBe('node.up');
  });

  it('stays quiet about inactive, which is what a deliberate stop looks like', () => {
    expect(classify(fact({ from: 'healthy', to: 'inactive' }))).toBeNull();
    expect(classify(fact({ from: 'inactive', to: 'healthy' }))).toBeNull();
    expect(classify(fact({ from: 'inactive', to: 'down' }))).toBeNull();
  });

  it('does not treat the first ever reading as an incident', () => {
    expect(classify(fact({ from: null, to: 'down' }))).toBeNull();
    expect(classify(fact({ subject: 'route', from: null, to: 'unhealthy' }))).toBeNull();
  });

  it('handles routes on their own vocabulary', () => {
    const route = { subject: 'route' as const, name: 'app.example.com' };
    expect(classify(fact({ ...route, from: 'healthy', to: 'unhealthy' }))).toBe('route.down');
    expect(classify(fact({ ...route, from: 'unhealthy', to: 'healthy' }))).toBe('route.up');
    expect(classify(fact({ ...route, from: 'unknown', to: 'unhealthy' }))).toBeNull();
  });

  it('ignores a state that did not actually change', () => {
    expect(classify(fact({ from: 'healthy', to: 'healthy' }))).toBeNull();
    expect(classify(fact({ from: 'down', to: 'down' }))).toBeNull();
  });
});

describe('cooldown', () => {
  it('suppresses a repeat alert about the same thing', () => {
    expect(inCooldown('node.down', NOW - 2 * MINUTE, NOW)).toBe(true);
  });

  it('lets one through once the window has passed', () => {
    expect(inCooldown('node.down', NOW - (ALERT_COOLDOWN_MINUTES + 1) * MINUTE, NOW)).toBe(false);
  });

  it('never delays an all-clear', () => {
    // A recovery can only follow an alert that already fired, so the window would always swallow it.
    expect(inCooldown('node.up', NOW - 1000, NOW)).toBe(false);
  });

  it('does not suppress the first alert of all', () => {
    expect(inCooldown('node.down', null, NOW)).toBe(false);
  });
});

describe('message', () => {
  it('says what broke and what it was before', () => {
    expect(describeFact(fact(), 'node.down')).toBe('Node vps-fra is down (was healthy)');
  });

  it('reads like an all-clear on recovery', () => {
    const f = fact({ from: 'down', to: 'healthy' });
    expect(describeFact(f, 'node.up')).toBe('Node vps-fra recovered — back to healthy');
  });

  it('builds a payload consumers can branch on', () => {
    const payload = buildPayload(fact(), 'node.down');
    expect(payload).toMatchObject({
      v: 1,
      trigger: 'node.down',
      severity: 'critical',
      subject: { kind: 'node', id: 'node_1', name: 'vps-fra' },
      from: 'healthy',
      to: 'down',
    });
    expect(payload.at).toBe(new Date(NOW).toISOString());
  });

  it('marks recoveries as ok, not critical', () => {
    expect(severityOf('route.up')).toBe('ok');
    expect(severityOf('route.down')).toBe('critical');
  });
});
