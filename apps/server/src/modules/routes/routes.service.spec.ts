import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbService } from '../../db/db.service';
import { nodes, routes } from '../../db/schema';
import { RoutesService } from './routes.service';
import type { CloudflareService } from '../cloudflare/cloudflare.service';
import type { SettingsService } from '../settings/settings.service';
import type { EventsService } from '../events/events.service';
import type { EventBus } from '../../common/event-bus.service';

/**
 * Integration: a real (throwaway) SQLite under the isolated PUENTE_DATA_DIR, with
 * Cloudflare doubled at the service boundary. What matters here is the ingress list
 * puente hands to Cloudflare — order and membership decide whether a request routes.
 */
const dbs = new DbService();
const putIngress = vi.fn().mockResolvedValue(undefined);
const cloudflare = { putIngress } as unknown as CloudflareService;
const settings = {
  getZone: () => ({ id: 'z1', name: 'example.com' }),
} as unknown as SettingsService;
const events = { info: vi.fn(), success: vi.fn(), error: vi.fn() } as unknown as EventsService;
const bus = { emit: vi.fn() } as unknown as EventBus;

const svc = new RoutesService(dbs, cloudflare, settings, events, bus);

const t = Date.now();
const aNode = (over: Partial<typeof nodes.$inferInsert> = {}): typeof nodes.$inferInsert => ({
  id: 'node_1',
  name: 'n1',
  kind: 'local',
  tunnelId: 'tun_1',
  provisionState: 'provisioned',
  createdAt: t,
  updatedAt: t,
  ...over,
});
const aRoute = (over: Partial<typeof routes.$inferInsert> = {}): typeof routes.$inferInsert => ({
  id: 'r_1',
  nodeId: 'node_1',
  hostname: 'x.example.com',
  subdomain: 'x',
  zoneId: 'z1',
  zoneName: 'example.com',
  service: { protocol: 'http', host: 'localhost', port: 1000 },
  enabled: true,
  status: 'active',
  health: 'unknown',
  createdAt: t,
  updatedAt: t,
  ...over,
});

beforeEach(() => {
  dbs.db.delete(routes).run();
  dbs.db.delete(nodes).run();
  putIngress.mockClear();
});

afterAll(() => dbs.onModuleDestroy?.());

describe('RoutesService.rebuildIngress', () => {
  it('puts path rules first, skips disabled routes and builds the service URLs', async () => {
    dbs.db.insert(nodes).values(aNode()).run();
    dbs.db
      .insert(routes)
      .values([
        aRoute({ id: 'r_plain', hostname: 'a.example.com', subdomain: 'a' }),
        aRoute({
          id: 'r_path',
          hostname: 'b.example.com',
          subdomain: 'b',
          path: '/api',
          service: { protocol: 'http', host: 'localhost', port: 2000 },
        }),
        aRoute({ id: 'r_off', hostname: 'c.example.com', subdomain: 'c', enabled: false }),
      ])
      .run();

    await svc.rebuildIngress('node_1');

    expect(putIngress).toHaveBeenCalledTimes(1);
    const [tunnelId, rules] = putIngress.mock.calls[0];
    expect(tunnelId).toBe('tun_1');
    // the /api rule is the more specific one, so Cloudflare must see it first
    expect(rules.map((r: { hostname: string }) => r.hostname)).toEqual([
      'b.example.com',
      'a.example.com',
    ]);
    expect(rules[0]).toMatchObject({ path: '/api', service: 'http://localhost:2000' });
    expect(rules[1].service).toBe('http://localhost:1000');
    expect(rules[1].path).toBeUndefined();
    // a disabled route must never reach Cloudflare
    expect(rules.some((r: { hostname: string }) => r.hostname === 'c.example.com')).toBe(false);
  });

  it('forwards originRequest only when it carries options', async () => {
    dbs.db.insert(nodes).values(aNode()).run();
    dbs.db
      .insert(routes)
      .values([
        aRoute({
          id: 'r_opts',
          hostname: 'o.example.com',
          subdomain: 'o',
          originRequest: { noTLSVerify: true },
        }),
        aRoute({ id: 'r_empty', hostname: 'e.example.com', subdomain: 'e', originRequest: {} }),
      ])
      .run();

    await svc.rebuildIngress('node_1');

    const rules = putIngress.mock.calls[0][1] as Array<Record<string, unknown>>;
    const withOpts = rules.find((r) => r.hostname === 'o.example.com')!;
    const empty = rules.find((r) => r.hostname === 'e.example.com')!;
    expect(withOpts.originRequest).toEqual({ noTLSVerify: true });
    expect(empty.originRequest).toBeUndefined();
  });

  it('does nothing for a node that has no tunnel yet', async () => {
    dbs.db
      .insert(nodes)
      .values(aNode({ tunnelId: null, provisionState: 'unprovisioned' }))
      .run();
    await svc.rebuildIngress('node_1');
    expect(putIngress).not.toHaveBeenCalled();
  });
});
