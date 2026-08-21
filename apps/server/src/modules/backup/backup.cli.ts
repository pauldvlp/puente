import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { DbService } from '../../db/db.service';
import { DATA_DIR } from '../../config/paths';
import { readRunningState } from '../../daemon';
import { BackupError } from './backup.format';
import { BackupService, restoreToDataDir } from './backup.service';

import { bold, dim } from '../../common/colour';

/**
 * Reads a passphrase without echoing it, so it does not survive in a scrollback or a screen
 * recording. The `--passphrase` flag exists for scripts and says in its own help what it costs.
 */
async function promptPassphrase(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const stdout = process.stdout;
  const write = stdout.write.bind(stdout);
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
    if (s.includes(prompt)) write(s);
  };
  try {
    return await new Promise<string>((res) => rl.question(prompt, (answer) => res(answer)));
  } finally {
    rl.close();
    write('\n');
  }
}

export async function runBackupCommand(opts: { out?: string; passphrase?: string }): Promise<void> {
  const passphrase = opts.passphrase ?? (await promptPassphrase('Passphrase for this backup: '));
  if (!passphrase) {
    console.error('A passphrase is required — a backup holds your Cloudflare tokens.');
    process.exitCode = 1;
    return;
  }

  const dbs = new DbService();
  try {
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const out = resolve(opts.out ?? `puente-backup-${stamp}.pbk`);
    const sealed = await new BackupService(dbs).create(passphrase);
    writeFileSync(out, sealed, { mode: 0o600 });
    console.log(`\n  ${bold('Backup written')}  ${out}`);
    console.log(
      dim(`  ${(sealed.length / 1024).toFixed(1)} KB · keep it somewhere the server is not.`),
    );
    console.log(dim('  It holds your Cloudflare tokens, encrypted with that passphrase.\n'));
  } finally {
    dbs.onModuleDestroy();
  }
}

export async function runRestoreCommand(
  file: string | undefined,
  opts: { passphrase?: string },
): Promise<void> {
  if (!file) {
    console.error('Usage: puente restore <file.pbk>');
    process.exitCode = 1;
    return;
  }
  const path = resolve(file);
  if (!existsSync(path)) {
    console.error(`No such file: ${path}`);
    process.exitCode = 1;
    return;
  }

  // Writing the database out from under a running panel turns a rescue into a second incident.
  const running = readRunningState();
  if (running) {
    console.error(
      `\n  The panel is running (pid ${running.pid}). Stop it first:\n\n    puente stop\n`,
    );
    process.exitCode = 1;
    return;
  }

  const passphrase = opts.passphrase ?? (await promptPassphrase('Passphrase for this backup: '));
  try {
    const report = restoreToDataDir(readFileSync(path), passphrase);
    console.log(`\n  ${bold('Restored')} into ${DATA_DIR}`);
    console.log(dim(`  taken ${report.createdAt} by puente ${report.version}`));
    if (report.previousCopy) {
      console.log(dim(`  what was there is now at ${report.previousCopy}`));
    }
    console.log(`\n  Start it again:  ${bold('puente start')}\n`);
  } catch (err) {
    if (err instanceof BackupError) {
      console.error(`\n  ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}
