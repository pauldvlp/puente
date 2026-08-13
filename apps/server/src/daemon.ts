/**
 * Background-process plumbing for the CLI.
 *
 * `puente start` re-spawns itself detached (`--foreground`, so the child never recurses),
 * pipes stdout/stderr to `~/.puente/puente.log` and hands the terminal back. The child
 * records its pid and URL in `~/.puente/daemon.json` once it is actually listening, which
 * is what `stop`, `restart` and `status` read — and what the parent waits for before
 * declaring the panel ready.
 */
import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { DAEMON_STATE_PATH, LOG_PATH, ensureDataDir } from './config/paths';

/** What a running panel publishes about itself. */
export interface DaemonState {
  pid: number;
  port: number;
  host: string;
  url: string;
  /** ISO timestamp of the moment the server started listening. */
  startedAt: string;
}

/** Rotate the log once it passes this size, keeping a single previous file. */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Never read more than this from the tail of the log. */
const MAX_TAIL_BYTES = 512 * 1024;

/** Thrown when a detached start never became ready. Carries the log so the CLI can show it. */
export class DaemonStartError extends Error {
  constructor(
    message: string,
    public readonly logTail: string,
  ) {
    super(message);
    this.name = 'DaemonStartError';
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Signal 0 probes without touching the process; EPERM means it exists but is not ours. */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Parse a state file, rejecting anything malformed rather than trusting it. */
export function parseState(raw: string): DaemonState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { pid, port, host, url, startedAt } = data as Record<string, unknown>;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0) return null;
  if (typeof url !== 'string' || url.length === 0) return null;
  return {
    pid,
    port,
    url,
    host: typeof host === 'string' && host.length > 0 ? host : '0.0.0.0',
    startedAt: typeof startedAt === 'string' ? startedAt : new Date(0).toISOString(),
  };
}

export function readState(): DaemonState | null {
  if (!existsSync(DAEMON_STATE_PATH)) return null;
  try {
    return parseState(readFileSync(DAEMON_STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** The state only if its process is still alive; a stale file is removed on the way out. */
export function readRunningState(): DaemonState | null {
  const state = readState();
  if (!state) return null;
  if (isProcessAlive(state.pid)) return state;
  clearState(state.pid);
  return null;
}

export function writeState(state: DaemonState): void {
  ensureDataDir();
  writeFileSync(DAEMON_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

/** Remove the state file. With `pid`, only when it still belongs to that process. */
export function clearState(pid?: number): void {
  if (pid !== undefined) {
    const state = readState();
    if (state && state.pid !== pid) return;
  }
  rmSync(DAEMON_STATE_PATH, { force: true });
}

function rotateLog(): void {
  try {
    if (statSync(LOG_PATH).size > MAX_LOG_BYTES) renameSync(LOG_PATH, `${LOG_PATH}.1`);
  } catch {
    /* no log yet, or a filesystem that refuses the rename — not worth failing a start over */
  }
}

/** Last `lines` lines of `text`, without the trailing blank one. */
export function tailLines(text: string, lines: number): string {
  const all = text.split('\n');
  if (all.length > 0 && all[all.length - 1] === '') all.pop();
  return all.slice(Math.max(0, all.length - lines)).join('\n');
}

/** Read the tail of the daemon log, bounded so a big file never lands in memory. */
export function readLogTail(lines: number): string {
  if (!existsSync(LOG_PATH)) return '';
  try {
    const { size } = statSync(LOG_PATH);
    const length = Math.min(size, MAX_TAIL_BYTES);
    const buf = Buffer.alloc(length);
    const fd = openSync(LOG_PATH, 'r');
    try {
      readSync(fd, buf, 0, length, size - length);
    } finally {
      closeSync(fd);
    }
    return tailLines(buf.toString('utf8'), lines);
  } catch {
    return '';
  }
}

/**
 * Stream everything appended to the log from now on. Polls rather than using `fs.watch`,
 * which is unreliable across platforms. Returns a stop function.
 */
export function followLog(onChunk: (chunk: string) => void, intervalMs = 400): () => void {
  let offset = existsSync(LOG_PATH) ? statSync(LOG_PATH).size : 0;
  const timer = setInterval(() => {
    if (!existsSync(LOG_PATH)) return;
    const { size } = statSync(LOG_PATH);
    if (size < offset) offset = 0; // rotated or truncated underneath us
    if (size === offset) return;
    const buf = Buffer.alloc(size - offset);
    const fd = openSync(LOG_PATH, 'r');
    try {
      readSync(fd, buf, 0, buf.length, offset);
    } finally {
      closeSync(fd);
    }
    offset = size;
    onChunk(buf.toString('utf8'));
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export interface StartDetachedOptions {
  /** Absolute path to the compiled CLI entry point — the child is `node <entry> start …`. */
  entry: string;
  port: number;
  host: string;
  /** How long to wait for the child to report itself listening. */
  timeoutMs?: number;
}

/** Spawn the panel detached and resolve once it has published its state. */
export async function startDetached(opts: StartDetachedOptions): Promise<DaemonState> {
  ensureDataDir();
  rotateLog();
  const out = openSync(LOG_PATH, 'a');
  const child = spawn(
    process.execPath,
    [
      opts.entry,
      'start',
      '--foreground',
      '--no-open',
      '--port',
      String(opts.port),
      '--host',
      opts.host,
    ],
    {
      detached: true,
      stdio: ['ignore', out, out],
      // The marker tells the child it is a daemon: log a line instead of drawing the banner.
      env: { ...process.env, PUENTE_DAEMON: '1' },
      windowsHide: true,
    },
  );
  closeSync(out);
  const exit: { code: number | null } = { code: null };
  child.on('exit', (code) => {
    exit.code = code ?? 1;
  });
  child.on('error', () => {
    exit.code = 1;
  });
  child.unref();

  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  for (;;) {
    const state = readState();
    if (state && state.pid === child.pid) return state;
    if (exit.code !== null) {
      throw new DaemonStartError(
        `puente exited with code ${exit.code} before it was ready`,
        readLogTail(20),
      );
    }
    if (Date.now() >= deadline) {
      throw new DaemonStartError('timed out waiting for puente to become ready', readLogTail(20));
    }
    await delay(150);
  }
}

export type StopResult =
  { result: 'not-running' } | { result: 'stopped' | 'killed'; state: DaemonState };

/** SIGTERM the running panel, escalating to SIGKILL if it will not go. */
export async function stopDaemon(opts: { timeoutMs?: number } = {}): Promise<StopResult> {
  const state = readRunningState();
  if (!state) {
    clearState();
    return { result: 'not-running' };
  }
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    clearState(state.pid);
    return { result: 'stopped', state };
  }
  while (Date.now() < deadline) {
    if (!isProcessAlive(state.pid)) {
      clearState(state.pid);
      return { result: 'stopped', state };
    }
    await delay(100);
  }
  try {
    process.kill(state.pid, 'SIGKILL');
  } catch {
    /* it died between the check and the signal */
  }
  const killDeadline = Date.now() + 3_000;
  while (Date.now() < killDeadline && isProcessAlive(state.pid)) await delay(100);
  clearState(state.pid);
  return { result: 'killed', state };
}

/** Coarse, human-readable uptime: the two largest units that matter. */
export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
