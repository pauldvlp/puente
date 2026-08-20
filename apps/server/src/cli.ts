#!/usr/bin/env node
import 'reflect-metadata';
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { bootstrap } from './main';
import { DATA_DIR, DB_PATH, LOG_PATH } from './config/paths';
import { APP_VERSION } from './config/version';
import { runLicenseCommand } from './ee/license/license.cli';
import {
  DaemonStartError,
  clearState,
  followLog,
  formatUptime,
  readLogTail,
  readRunningState,
  startDetached,
  stopDaemon,
  writeState,
} from './daemon';

const DEFAULT_PORT = Number(process.env.PUENTE_PORT ?? process.env.PORT ?? 5006);

const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function banner(url: string, footer: string[]): void {
  const line = '─'.repeat(46);
  console.log('');
  console.log(cyan(`  ┌${line}┐`));
  console.log(
    cyan('  │') + bold('  ☁  puente — Cloudflare Tunnel manager') + '       ' + cyan('│'),
  );
  console.log(cyan(`  ├${line}┤`));
  console.log(cyan('  │') + `  Dashboard:  ${green(url)}`.padEnd(56) + cyan('│'));
  console.log(cyan('  │') + dim(`  Data dir:   ${DATA_DIR}`).padEnd(64) + cyan('│'));
  console.log(cyan(`  └${line}┘`));
  console.log('');
  for (const l of footer) console.log(dim(`  ${l}`));
  console.log('');
}

function openBrowser(url: string): void {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], {
      stdio: 'ignore',
      detached: true,
      shell: platform() === 'win32',
    });
    child.on('error', () => undefined);
    child.unref();
  } catch {
    /* headless environment — ignore */
  }
}

/** Run the server in this process, holding the terminal until Ctrl+C. */
async function startForeground(port: number, host: string, open: boolean): Promise<void> {
  const handle = await bootstrap({ port, host });
  const startedAt = new Date().toISOString();
  writeState({ pid: process.pid, port: handle.port, host, url: handle.url, startedAt });
  if (process.env.PUENTE_DAEMON === '1') {
    // Detached child: this goes to the log file, where a banner would only be noise.
    console.log(
      `[${startedAt}] puente v${APP_VERSION} listening on ${handle.url} (pid ${process.pid})`,
    );
  } else {
    banner(handle.url, ['Press Ctrl+C to stop.']);
    if (open) openBrowser(handle.url);
  }
  const shutdown = async () => {
    clearState(process.pid);
    await handle.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/** Spawn the server detached and give the terminal back. */
async function startBackground(port: number, host: string, open: boolean): Promise<void> {
  const running = readRunningState();
  if (running) {
    console.log('');
    console.log(
      `  ${yellow('•')} puente is already running (pid ${running.pid}) — ${green(running.url)}`,
    );
    console.log(dim('    Use `puente restart` to apply new options, or `puente stop`.'));
    console.log('');
    if (open) openBrowser(running.url);
    return;
  }
  console.log(dim('\n  Starting puente in the background…'));
  const state = await startDetached({ entry: __filename, port, host });
  banner(state.url, [
    `Running in the background (pid ${state.pid}).`,
    'Logs: puente logs -f   ·   Stop: puente stop',
  ]);
  if (open) openBrowser(state.url);
}

function reportStartFailure(err: unknown): never {
  if (err instanceof DaemonStartError) {
    console.error(`\n  ${red('✖')} ${err.message}`);
    if (err.logTail) {
      console.error(dim(`\n  Last lines of ${LOG_PATH}:\n`));
      console.error(err.logTail);
    }
    console.error('');
    process.exit(1);
  }
  throw err;
}

const program = new Command();
program
  .name('puente')
  .description('Centralized, self-hosted manager for Cloudflare Tunnels across your machines.')
  .version(APP_VERSION);

program
  .command('start', { isDefault: true })
  .description('Start the puente control panel in the background')
  .option('-p, --port <port>', 'port to listen on', String(DEFAULT_PORT))
  .option('--host <host>', 'host to bind', '0.0.0.0')
  .option('--no-open', 'do not open the browser automatically')
  .option('-f, --foreground', 'stay attached to this terminal (Docker, systemd, CI)', false)
  .action(async (opts: { port: string; host: string; open: boolean; foreground: boolean }) => {
    const port = Number(opts.port) || DEFAULT_PORT;
    if (opts.foreground) {
      await startForeground(port, opts.host, opts.open);
      return;
    }
    await startBackground(port, opts.host, opts.open).catch(reportStartFailure);
  });

program
  .command('setup')
  .description('Start the panel and open the guided setup wizard in your browser')
  .option('-p, --port <port>', 'port to listen on', String(DEFAULT_PORT))
  .option('-f, --foreground', 'stay attached to this terminal (Docker, systemd, CI)', false)
  .action(async (opts: { port: string; foreground: boolean }) => {
    console.log(dim('\n  Opening the setup wizard — create your admin account, then'));
    console.log(dim('  connect Cloudflare with an API token (scopes shown in the UI).'));
    const port = Number(opts.port) || DEFAULT_PORT;
    if (opts.foreground) {
      await startForeground(port, '0.0.0.0', true);
      return;
    }
    await startBackground(port, '0.0.0.0', true).catch(reportStartFailure);
  });

program
  .command('stop')
  .description('Stop the panel running in the background')
  .action(async () => {
    const res = await stopDaemon();
    if (res.result === 'not-running') {
      console.log(dim('\n  puente is not running.\n'));
      return;
    }
    const forced = res.result === 'killed' ? dim(' (forced)') : '';
    console.log(`\n  ${green('✔')} Stopped puente — pid ${res.state.pid}${forced}.\n`);
  });

program
  .command('restart')
  .description('Restart the panel in the background')
  .option('-p, --port <port>', 'port to listen on')
  .option('--host <host>', 'host to bind')
  .option('--open', 'open the browser once it is back up', false)
  .action(async (opts: { port?: string; host?: string; open: boolean }) => {
    const previous = readRunningState();
    const res = await stopDaemon();
    if (res.result !== 'not-running') {
      console.log(dim(`\n  Stopped pid ${res.state.pid}.`));
    }
    const port = Number(opts.port) || previous?.port || DEFAULT_PORT;
    const host = opts.host ?? previous?.host ?? '0.0.0.0';
    await startBackground(port, host, opts.open).catch(reportStartFailure);
  });

program
  .command('status')
  .description('Show whether the panel is running (exit code 3 when it is not)')
  .action(() => {
    const state = readRunningState();
    console.log('');
    if (!state) {
      console.log(`  ${dim('○')} puente is ${bold('stopped')}.`);
      console.log(dim(`    logs     : ${LOG_PATH}`));
      console.log('');
      process.exitCode = 3;
      return;
    }
    const uptime = formatUptime(Date.now() - Date.parse(state.startedAt));
    console.log(`  ${green('●')} puente is ${bold('running')} — ${green(state.url)}`);
    console.log(dim(`    pid      : ${state.pid}`));
    console.log(dim(`    bound to : ${state.host}:${state.port}`));
    console.log(dim(`    uptime   : ${uptime}`));
    console.log(dim(`    data dir : ${DATA_DIR}`));
    console.log(dim(`    logs     : ${LOG_PATH}`));
    console.log('');
  });

program
  .command('logs')
  .description('Show the log of the panel running in the background')
  .option('-n, --lines <n>', 'how many lines to show', '50')
  .option('-f, --follow', 'keep streaming new output', false)
  .action((opts: { lines: string; follow: boolean }) => {
    const lines = Number(opts.lines) || 50;
    const tail = readLogTail(lines);
    if (tail) console.log(tail);
    else console.log(dim(`  No log yet at ${LOG_PATH}.`));
    if (!opts.follow) return;
    const stop = followLog((chunk) => process.stdout.write(chunk));
    // Hold the process open until Ctrl+C.
    const keepAlive = setInterval(() => undefined, 1 << 30);
    const finish = () => {
      stop();
      clearInterval(keepAlive);
      process.exit(0);
    };
    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);
  });

program
  .command('info')
  .description('Print paths and version')
  .action(() => {
    console.log(`${bold('puente')} v${APP_VERSION}`);
    console.log(`  data dir : ${DATA_DIR}`);
    console.log(`  database : ${DB_PATH}`);
    console.log(`  logs     : ${LOG_PATH}`);
    console.log(`  node     : ${process.version}`);
  });

program
  .command('license [action] [key]')
  .description('Show, activate or remove the puente Pro license (actions: activate, remove)')
  .action((action: string | undefined, key: string | undefined) => {
    const verb = action ?? 'show';
    if (verb !== 'show' && verb !== 'activate' && verb !== 'remove') {
      console.error(`Unknown action "${verb}". Use: puente license [activate <key> | remove]`);
      process.exitCode = 1;
      return;
    }
    runLicenseCommand(verb, key);
  });

program
  .command('doctor')
  .description('Check the local environment')
  .action(async () => {
    const checks: Array<[string, boolean, string]> = [];
    const nodeOk = Number(process.versions.node.split('.')[0]) >= 22;
    checks.push(['Node.js >= 22', nodeOk, process.version]);
    checks.push(['Data directory', existsSync(DATA_DIR), DATA_DIR]);
    const cf = await hasBinary('cloudflared');
    checks.push([
      'cloudflared (local)',
      cf,
      cf ? 'found on PATH' : 'not found — puente will download it when needed',
    ]);
    const ssh = await hasBinary('ssh');
    checks.push(['ssh client', ssh, ssh ? 'found' : 'not found']);
    const running = readRunningState();
    checks.push([
      'panel process',
      !!running,
      running ? `running (pid ${running.pid}) on ${running.url}` : 'not running',
    ]);
    console.log(`\n${bold('puente doctor')}\n`);
    for (const [name, ok, detail] of checks) {
      console.log(`  ${ok ? green('✔') : yellow('!')} ${name.padEnd(22)} ${dim(detail)}`);
    }
    console.log('');
  });

function hasBinary(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', `command -v ${name}`], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
