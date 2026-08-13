import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { DAEMON_STATE_PATH, LOG_PATH, ensureDataDir } from './config/paths';
import {
  DaemonStartError,
  clearState,
  formatUptime,
  isProcessAlive,
  parseState,
  readRunningState,
  readState,
  startDetached,
  stopDaemon,
  tailLines,
  writeState,
  type DaemonState,
} from './daemon';

const state = (over: Partial<DaemonState> = {}): DaemonState => ({
  pid: process.pid,
  port: 5006,
  host: '0.0.0.0',
  url: 'http://localhost:5006',
  startedAt: new Date().toISOString(),
  ...over,
});

/** A pid that cannot be running: above the max on every platform we support. */
const DEAD_PID = 4_194_305;

afterEach(() => {
  rmSync(DAEMON_STATE_PATH, { force: true });
});

describe('parseState', () => {
  it('accepts a well-formed state file', () => {
    const parsed = parseState(JSON.stringify(state({ pid: 42, port: 5099 })));
    expect(parsed).toMatchObject({ pid: 42, port: 5099, url: 'http://localhost:5006' });
  });

  it('rejects malformed or half-written files instead of trusting them', () => {
    expect(parseState('{"pid":1,')).toBeNull(); // truncated by a crash mid-write
    expect(parseState('null')).toBeNull();
    expect(parseState('[]')).toBeNull();
    expect(parseState(JSON.stringify({ ...state(), pid: 'x' }))).toBeNull();
    expect(parseState(JSON.stringify({ ...state(), pid: 0 }))).toBeNull();
    expect(parseState(JSON.stringify({ ...state(), port: -1 }))).toBeNull();
    expect(parseState(JSON.stringify({ ...state(), url: '' }))).toBeNull();
  });

  it('falls back on optional fields rather than dropping the whole state', () => {
    const parsed = parseState(JSON.stringify({ pid: 7, port: 5006, url: 'http://x' }));
    expect(parsed).toMatchObject({ pid: 7, host: '0.0.0.0' });
    expect(Date.parse(parsed!.startedAt)).not.toBeNaN();
  });
});

describe('isProcessAlive', () => {
  it('sees this very process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('reports unusable pids as dead', () => {
    expect(isProcessAlive(DEAD_PID)).toBe(false);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(1.5)).toBe(false);
  });
});

describe('state file', () => {
  it('round-trips through disk', () => {
    writeState(state({ port: 5100 }));
    expect(readState()).toMatchObject({ pid: process.pid, port: 5100 });
  });

  it('drops a stale file left behind by a crashed panel', () => {
    writeState(state({ pid: DEAD_PID }));
    expect(readRunningState()).toBeNull();
    expect(readState()).toBeNull(); // and cleaned up, so `start` is not blocked forever
  });

  it('keeps the file when the recorded process is alive', () => {
    writeState(state());
    expect(readRunningState()).toMatchObject({ pid: process.pid });
  });

  it('does not let one instance clear another instance state', () => {
    writeState(state({ pid: DEAD_PID }));
    clearState(process.pid);
    expect(readState()).toMatchObject({ pid: DEAD_PID });
    clearState(DEAD_PID);
    expect(readState()).toBeNull();
  });
});

describe('stopDaemon', () => {
  it('reports not-running when nothing is up', async () => {
    await expect(stopDaemon()).resolves.toEqual({ result: 'not-running' });
  });

  it('clears a stale state file instead of signalling a dead pid', async () => {
    writeState(state({ pid: DEAD_PID }));
    await expect(stopDaemon()).resolves.toEqual({ result: 'not-running' });
    expect(readState()).toBeNull();
  });
});

describe('startDetached', () => {
  it('surfaces the log when the child dies before it is ready', async () => {
    ensureDataDir();
    rmSync(LOG_PATH, { force: true });
    const err = await startDetached({
      entry: '/nonexistent/puente-cli-that-is-not-there.js',
      port: 5099,
      host: '127.0.0.1',
      timeoutMs: 10_000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DaemonStartError);
    expect((err as DaemonStartError).message).toMatch(/exited with code/);
    expect((err as DaemonStartError).logTail).toMatch(/not-there/);
  });
});

describe('tailLines', () => {
  it('keeps the last n lines and ignores the trailing newline', () => {
    expect(tailLines('a\nb\nc\n', 2)).toBe('b\nc');
    expect(tailLines('a\nb\n', 10)).toBe('a\nb');
    expect(tailLines('', 5)).toBe('');
  });
});

describe('formatUptime', () => {
  it('shows the two units that matter', () => {
    expect(formatUptime(12_000)).toBe('12s');
    expect(formatUptime(5 * 60_000 + 3_000)).toBe('5m 3s');
    expect(formatUptime(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m');
    expect(formatUptime(3 * 86_400_000 + 4 * 3_600_000)).toBe('3d 4h');
  });

  it('does not pretend to know an unparseable timestamp', () => {
    expect(formatUptime(NaN)).toBe('unknown');
    expect(formatUptime(-1)).toBe('unknown');
  });
});
