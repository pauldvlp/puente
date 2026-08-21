import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Node } from '@puente/shared';
import type { NodesService } from '../../modules/nodes/nodes.service';
import type { EventsService } from '../../modules/events/events.service';
import type { EventBus } from '../../common/event-bus.service';
import { FleetService } from './fleet.service';

const node = (id: string, name: string, provisioned = true): Node =>
  ({ id, name, tunnelId: provisioned ? `tun_${id}` : null }) as Node;

let order: string[];
let upgrade: ReturnType<typeof vi.fn>;
let setConnector: ReturnType<typeof vi.fn>;

function make(nodes: Node[]): FleetService {
  order = [];
  upgrade = vi.fn(async (id: string) => {
    order.push(`upgrade:${id}`);
    // A real upgrade is slow; the delay is what makes "sequential" observable.
    await new Promise((r) => setTimeout(r, 10));
    return node(id, id);
  });
  setConnector = vi.fn(async (id: string, action: string) => {
    order.push(`${action}:${id}`);
    return node(id, id);
  });

  const nodesService = {
    list: () => nodes,
    upgradeConnector: upgrade,
    setConnector,
  } as unknown as NodesService;
  const events = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as EventsService;
  const bus = { progress: vi.fn() } as unknown as EventBus;

  return new FleetService(nodesService, events, bus);
}

const codeOf = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
  } catch (err) {
    if (err instanceof BadRequestException) return (err.getResponse() as { code: string }).code;
  }
  return 'no-error';
};

beforeEach(() => {
  vi.useRealTimers();
});

describe('FleetService', () => {
  it('works through the fleet one node at a time', async () => {
    // Upgrading in parallel would take every tunnel down at once, which is the outage the
    // agency was hired to prevent.
    const svc = make([node('a', 'nas'), node('b', 'vps'), node('c', 'pi')]);
    const run = await svc.run({ operation: 'upgrade' });

    expect(order).toEqual(['upgrade:a', 'upgrade:b', 'upgrade:c']);
    expect(run.succeeded).toBe(3);
    expect(run.failed).toBe(0);
  });

  it('keeps going when one machine is unreachable', async () => {
    const svc = make([node('a', 'nas'), node('b', 'vps'), node('c', 'pi')]);
    upgrade.mockImplementationOnce(async (id: string) => {
      order.push(`upgrade:${id}`);
      return node(id, id);
    });
    upgrade.mockImplementationOnce(async () => {
      throw new Error('ssh: connect to host 10.0.0.9 port 22: No route to host');
    });

    const run = await svc.run({ operation: 'upgrade' });

    expect(run.succeeded).toBe(2);
    expect(run.failed).toBe(1);
    const failure = run.results.find((r) => !r.ok);
    expect(failure?.name).toBe('vps');
    expect(failure?.message).toContain('No route to host');
    // And the third node was still attempted.
    expect(run.results.map((r) => r.nodeId)).toEqual(['a', 'b', 'c']);
  });

  it('restarts rather than upgrades when asked to', async () => {
    const svc = make([node('a', 'nas')]);
    await svc.run({ operation: 'restart' });
    expect(order).toEqual(['restart:a']);
    expect(upgrade).not.toHaveBeenCalled();
  });

  it('only touches the nodes it was given', async () => {
    const svc = make([node('a', 'nas'), node('b', 'vps'), node('c', 'pi')]);
    const run = await svc.run({ operation: 'upgrade', nodeIds: ['b'] });
    expect(order).toEqual(['upgrade:b']);
    expect(run.results).toHaveLength(1);
  });

  it('skips nodes that have no connector yet', async () => {
    const svc = make([node('a', 'nas'), node('b', 'not-set-up', false)]);
    const run = await svc.run({ operation: 'upgrade' });
    expect(order).toEqual(['upgrade:a']);
    expect(run.results.map((r) => r.nodeId)).toEqual(['a']);
  });

  it('says so instead of pretending, when there is nothing to act on', async () => {
    const svc = make([node('a', 'never-provisioned', false)]);
    expect(await codeOf(() => svc.run({ operation: 'upgrade' }))).toBe('FLEET_EMPTY');
  });

  it('refuses a second run while one is in flight', async () => {
    // Two rolling upgrades at once would defeat the point of rolling them.
    const svc = make([node('a', 'nas'), node('b', 'vps')]);
    const first = svc.run({ operation: 'upgrade' });
    expect(await codeOf(() => svc.run({ operation: 'upgrade' }))).toBe('FLEET_BUSY');
    await first;
    // And once it finishes, the door is open again.
    const second = await svc.run({ operation: 'restart' });
    expect(second.succeeded).toBe(2);
  });

  it('reports both ends of the run, for a record of what happened', async () => {
    const svc = make([node('a', 'nas')]);
    const run = await svc.run({ operation: 'upgrade' });
    expect(Date.parse(run.finishedAt)).toBeGreaterThanOrEqual(Date.parse(run.startedAt));
    expect(run.operation).toBe('upgrade');
  });
});
