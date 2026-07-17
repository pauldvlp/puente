#!/usr/bin/env node
import 'reflect-metadata';
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { bootstrap } from './main';
import { DATA_DIR, DB_PATH } from './config/paths';
import { APP_VERSION } from './config/version';

const DEFAULT_PORT = Number(process.env.PUENTE_PORT ?? process.env.PORT ?? 5006);

const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function banner(url: string): void {
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
  console.log(dim('  Press Ctrl+C to stop.'));
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

async function start(port: number, host: string, open: boolean): Promise<void> {
  const handle = await bootstrap({ port, host });
  banner(handle.url);
  if (open) openBrowser(handle.url);
  const shutdown = async () => {
    await handle.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const program = new Command();
program
  .name('puente')
  .description('Centralized, self-hosted manager for Cloudflare Tunnels across your machines.')
  .version(APP_VERSION);

program
  .command('start', { isDefault: true })
  .description('Start the puente control panel')
  .option('-p, --port <port>', 'port to listen on', String(DEFAULT_PORT))
  .option('--host <host>', 'host to bind', '0.0.0.0')
  .option('--no-open', 'do not open the browser automatically')
  .action(async (opts: { port: string; host: string; open: boolean }) => {
    await start(Number(opts.port) || DEFAULT_PORT, opts.host, opts.open);
  });

program
  .command('setup')
  .description('Start the panel and open the guided setup wizard in your browser')
  .option('-p, --port <port>', 'port to listen on', String(DEFAULT_PORT))
  .action(async (opts: { port: string }) => {
    console.log(dim('\n  Opening the setup wizard — create your admin account, then'));
    console.log(dim('  connect Cloudflare with an API token (scopes shown in the UI).\n'));
    await start(Number(opts.port) || DEFAULT_PORT, '0.0.0.0', true);
  });

program
  .command('info')
  .description('Print paths and version')
  .action(() => {
    console.log(`${bold('puente')} v${APP_VERSION}`);
    console.log(`  data dir : ${DATA_DIR}`);
    console.log(`  database : ${DB_PATH}`);
    console.log(`  node     : ${process.version}`);
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
    console.log(`\n${bold('puente doctor')}\n`);
    for (const [name, ok, detail] of checks) {
      console.log(`  ${ok ? green('✔') : '\x1b[33m!\x1b[0m'} ${name.padEnd(22)} ${dim(detail)}`);
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
