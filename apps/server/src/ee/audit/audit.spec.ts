import { describe, it, expect } from 'vitest';
import type { ActivityEvent } from '@puente/shared';
import { toCsv } from './audit.controller';

const event = (over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id: 'evt_1',
  ts: '2026-08-21T10:00:00.000Z',
  username: 'paul',
  level: 'success',
  action: 'route.create',
  message: 'Published app.example.com',
  nodeId: 'node_1',
  routeId: 'route_1',
  meta: null,
  ...over,
});

describe('audit CSV', () => {
  it('writes a header and one line per entry', () => {
    const csv = toCsv([event()]);
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('ts,level,action,username,message,nodeId,routeId');
    expect(row).toBe(
      '2026-08-21T10:00:00.000Z,success,route.create,paul,Published app.example.com,node_1,route_1',
    );
  });

  it('quotes a message containing a comma, so the columns do not shift', () => {
    // The failure this prevents is silent: every column after the comma moves by one, and
    // nobody notices until the spreadsheet is in front of an auditor.
    const csv = toCsv([event({ message: 'Removed node vps-fra, and its routes' })]);
    expect(csv).toContain('"Removed node vps-fra, and its routes"');
  });

  it('doubles embedded quotes rather than breaking the field', () => {
    const csv = toCsv([event({ message: 'Tunnel "puente-nas" went down' })]);
    expect(csv).toContain('"Tunnel ""puente-nas"" went down"');
  });

  it('survives a newline inside a message', () => {
    const csv = toCsv([event({ message: 'line one\nline two' })]);
    expect(csv).toContain('"line one\nline two"');
    // Header + one quoted record that happens to span two physical lines.
    expect(csv.trim().split('\n')).toHaveLength(3);
  });

  it('leaves an unknown actor blank instead of inventing one', () => {
    // Rows written by the poller, or before puente recorded actors at all.
    const csv = toCsv([event({ username: null, nodeId: null, routeId: null })]);
    expect(csv.trim().split('\n')[1]).toBe(
      '2026-08-21T10:00:00.000Z,success,route.create,,Published app.example.com,,',
    );
  });

  it('emits just the header when there is nothing to export', () => {
    expect(toCsv([])).toBe('ts,level,action,username,message,nodeId,routeId\n');
  });
});
