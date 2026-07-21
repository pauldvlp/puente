import { afterAll, describe, expect, it } from 'vitest';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { SettingsService } from '../settings/settings.service';
import { CloudflareService } from './cloudflare.service';

/**
 * LIVE — talks to the real Cloudflare API and creates real resources (a tunnel and a
 * proxied CNAME), then deletes them. Skipped unless CF_TEST_API_TOKEN is present, so
 * ordinary CI and local runs never touch an account.
 *
 * This is the other half of the hybrid in the conventions: the mocked integration specs
 * pin the logic, this pins the parts only the real API can prove — SDK v6 call shapes,
 * the ingress PUT payload, the DNS record shape, and cascade cleanup.
 *
 * Every resource it creates is named `e2e-<run id>` / `puente-e2e-<run id>`, and it only
 * ever deletes by the exact id it just created — it cannot touch anything else in the zone.
 */
const TOKEN = process.env.CF_TEST_API_TOKEN;
const ZONE = process.env.PUENTE_E2E_ZONE ?? 'gdy.me';
const RUN = process.env.GITHUB_RUN_ID ?? String(Date.now());

describe.skipIf(!TOKEN)('Cloudflare, live', () => {
  const dbs = new DbService();
  const cf = new CloudflareService(new SettingsService(dbs, new CryptoService()));

  const hostname = `e2e-${RUN}.${ZONE}`;
  let zoneId = '';
  let tunnelId = '';
  let recordId = '';

  // Belt and braces: whatever the tests did, leave nothing behind.
  afterAll(async () => {
    if (zoneId && recordId) {
      await cf.deleteDnsRecord(zoneId, recordId).catch(() => undefined);
    }
    if (tunnelId) await cf.deleteTunnel(tunnelId).catch(() => undefined);
    dbs.onModuleDestroy?.();
  });

  it('verifies the token and discovers the account', async () => {
    const v = await cf.verifyToken(TOKEN!);
    expect(v.status).toBe('active');
    expect(v.accounts.length).toBeGreaterThan(0);
  });

  it('connects, and the test zone is visible to the token', async () => {
    await cf.connect(TOKEN!);
    const zones = await cf.refreshZones();
    const zone = zones.find((z) => z.name === ZONE);
    expect(
      zone,
      `zone "${ZONE}" is not visible to this token — check its Zone Resources`,
    ).toBeTruthy();
    zoneId = zone!.id;
  });

  it('creates a tunnel', async () => {
    const t = await cf.createTunnel(`puente-e2e-${RUN}`);
    tunnelId = t.id;
    expect(tunnelId).toBeTruthy();

    const info = await cf.getTunnelInfo(tunnelId);
    expect(info?.name).toBe(`puente-e2e-${RUN}`);
  });

  it('writes the ingress configuration', async () => {
    // Cloudflare accepting the PUT is the assertion: a wrong payload shape (the whole-list
    // overwrite, the nested `config.ingress`, the terminal catch-all) is rejected outright.
    await expect(
      cf.putIngress(tunnelId, [{ hostname, service: 'http://localhost:9999' }]),
    ).resolves.toBeUndefined();
  });

  it('publishes the proxied CNAME to the tunnel', async () => {
    const res = await cf.upsertTunnelCname(zoneId, hostname, tunnelId);
    recordId = res.recordId;
    expect(recordId).toBeTruthy();
  });

  it('is idempotent — re-publishing the same hostname reuses the record', async () => {
    const again = await cf.upsertTunnelCname(zoneId, hostname, tunnelId);
    expect(again.recordId).toBe(recordId);
  });

  it('cleans up: the DNS record is deleted and the tunnel leaves the live list', async () => {
    await cf.deleteDnsRecord(zoneId, recordId);
    recordId = '';

    await cf.deleteTunnel(tunnelId);
    // Cloudflare SOFT-deletes tunnels: fetching one by id still resolves, with deleted_at
    // set — it does not 404. "Gone" therefore means gone from the list puente builds, which
    // is exactly what listTunnels() filters on. (Learned from the first live run.)
    const live = await cf.listTunnels();
    expect(live.some((t) => t.id === tunnelId)).toBe(false);
    tunnelId = '';
  });
});
