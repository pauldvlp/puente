import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LICENSE_GRACE_DAYS, type LicensePayload } from '@puente/shared';
import { verifyLicenseKey, daysRemaining } from './license.verify';
import { LICENSE_PUBLIC_KEY_PEM } from './license.keys';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 0, 15);
const ISSUER = resolve(__dirname, '../../../../../scripts/license/issue.mjs');

/** A throwaway signing pair, so the test never needs the real private key. */
let privatePem: string;
let publicPem: string;
let privatePath: string;

const basePayload = (over: Partial<LicensePayload> = {}): LicensePayload => ({
  v: 1,
  id: 'lic_test',
  licensee: 'Acme GmbH',
  email: 'ops@acme.de',
  plan: 'agency',
  features: ['team', 'audit', 'workspaces'],
  seats: 15,
  nodes: null,
  issuedAt: NOW - 30 * DAY_MS,
  expiresAt: NOW + 300 * DAY_MS,
  ...over,
});

function makeKey(payload: LicensePayload, pem = privatePem): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(null, Buffer.from(encoded, 'utf8'), pem).toString('base64url');
  return `puente-lic-v1.${encoded}.${sig}`;
}

beforeAll(() => {
  const pair = generateKeyPairSync('ed25519');
  privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  privatePath = join(mkdtempSync(join(tmpdir(), 'puente-lic-')), 'signing-key.pem');
  writeFileSync(privatePath, privatePem, { mode: 0o600 });
});

describe('verifyLicenseKey', () => {
  it('accepts a key signed by the matching private key', () => {
    const result = verifyLicenseKey(makeKey(basePayload()), publicPem, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.licensee).toBe('Acme GmbH');
    expect(result.value.payload.features).toContain('workspaces');
    expect(result.value.inGrace).toBe(false);
  });

  it('rejects a key signed by a different private key', () => {
    const other = generateKeyPairSync('ed25519').privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    const result = verifyLicenseKey(makeKey(basePayload(), other), publicPem, NOW);
    expect(result).toEqual({ ok: false, problem: 'bad-signature' });
  });

  it('rejects a payload edited after signing', () => {
    const key = makeKey(basePayload({ seats: 5 }));
    const [prefix, , sig] = key.split('.');
    const tampered = Buffer.from(JSON.stringify(basePayload({ seats: 5000 })), 'utf8').toString(
      'base64url',
    );
    const result = verifyLicenseKey(`${prefix}.${tampered}.${sig}`, publicPem, NOW);
    expect(result).toEqual({ ok: false, problem: 'bad-signature' });
  });

  it.each([
    ['empty', ''],
    ['not a key at all', 'hunter2'],
    ['right shape, wrong prefix', 'acme-lic-v1.aaaa.bbbb'],
    ['missing a segment', 'puente-lic-v1.aaaa'],
  ])('rejects a malformed key (%s)', (_label, key) => {
    expect(verifyLicenseKey(key, publicPem, NOW)).toEqual({ ok: false, problem: 'malformed' });
  });

  it('tells a v2 key apart from a forgery, so the user is told to update', () => {
    const key = makeKey(basePayload());
    const v2 = key.replace('puente-lic-v1.', 'puente-lic-v2.');
    expect(verifyLicenseKey(v2, publicPem, NOW)).toEqual({
      ok: false,
      problem: 'unsupported-version',
    });
  });

  it('keeps working inside the grace window, and says so', () => {
    const expiresAt = NOW - 3 * DAY_MS;
    const result = verifyLicenseKey(makeKey(basePayload({ expiresAt })), publicPem, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inGrace).toBe(true);
    expect(daysRemaining(result.value.payload, true, NOW)).toBe(LICENSE_GRACE_DAYS - 3);
  });

  it('expires once the grace window closes', () => {
    const expiresAt = NOW - (LICENSE_GRACE_DAYS + 1) * DAY_MS;
    expect(verifyLicenseKey(makeKey(basePayload({ expiresAt })), publicPem, NOW)).toEqual({
      ok: false,
      problem: 'expired',
    });
  });

  it('treats a perpetual key as never expiring', () => {
    const result = verifyLicenseKey(makeKey(basePayload({ expiresAt: null })), publicPem, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(daysRemaining(result.value.payload, false, NOW + 4000 * DAY_MS)).toBeNull();
  });

  it('will not accept a self-signed key against the key shipped in the binary', () => {
    // The whole point of the embedded public key: anyone can generate a pair, nobody can
    // generate one that this build trusts.
    const result = verifyLicenseKey(makeKey(basePayload()), LICENSE_PUBLIC_KEY_PEM, NOW);
    expect(result).toEqual({ ok: false, problem: 'bad-signature' });
  });
});

describe('scripts/license/issue.mjs', () => {
  it('issues keys the verifier accepts, with the plan defaults applied', () => {
    const out = execFileSync(
      process.execPath,
      [
        ISSUER,
        '--licensee',
        'Beta Ltd',
        '--email',
        'it@beta.example',
        '--plan',
        'pro',
        '--months',
        '12',
        '--key',
        privatePath,
      ],
      { encoding: 'utf8' },
    ).trim();

    const result = verifyLicenseKey(out, publicPem, Date.now());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.plan).toBe('pro');
    expect(result.value.payload.seats).toBe(5);
    expect(result.value.payload.features).toEqual(['team', 'audit', 'alerts', 'backup', 'api']);
    // Pro does not include SSO or the agency-only features.
    expect(result.value.payload.features).not.toContain('sso');
    expect(result.value.payload.features).not.toContain('workspaces');
    expect(result.value.payload.expiresAt).toBeGreaterThan(Date.now());
  });

  it('honours --perpetual and an explicit feature list', () => {
    const out = execFileSync(
      process.execPath,
      [
        ISSUER,
        '--licensee',
        'Gamma',
        '--email',
        'g@example.com',
        '--plan',
        'enterprise',
        '--perpetual',
        '--features',
        'sso,audit',
        '--key',
        privatePath,
      ],
      { encoding: 'utf8' },
    ).trim();

    const result = verifyLicenseKey(out, publicPem, Date.now());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.expiresAt).toBeNull();
    expect(result.value.payload.features).toEqual(['sso', 'audit']);
  });
});
