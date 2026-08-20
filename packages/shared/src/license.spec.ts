import { describe, it, expect } from 'vitest';
import { UPGRADE_URL, PRO_FEATURES, PLANS, LICENSE_GRACE_DAYS } from './license.js';

describe('UPGRADE_URL', () => {
  // The product's own upgrade button pointed at puente.dev for a while — a domain registered to
  // someone else. Until a domain is actually owned, this must stay on a host we control.
  const OWNED = ['github.com/pauldvlp/', 'npmjs.com/package/puente'];

  it('points at a host we own', () => {
    expect(OWNED.some((host) => UPGRADE_URL.includes(host))).toBe(true);
  });

  it('is https', () => {
    expect(UPGRADE_URL.startsWith('https://')).toBe(true);
  });
});

describe('edition contract', () => {
  it('keeps the free edition uncapped — no feature may gate nodes or routes', () => {
    // Community's whole promise. A `nodes`/`routes` feature flag would silently break it.
    expect(PRO_FEATURES).not.toContain('nodes');
    expect(PRO_FEATURES).not.toContain('routes');
    expect(PRO_FEATURES).not.toContain('tunnels');
  });

  it('gives an expired licence a grace period, so an invoice cannot take an origin down', () => {
    expect(LICENSE_GRACE_DAYS).toBeGreaterThanOrEqual(7);
  });

  it('has a plan for each segment we sell to', () => {
    expect(PLANS).toEqual(['pro', 'agency', 'enterprise']);
  });
});
