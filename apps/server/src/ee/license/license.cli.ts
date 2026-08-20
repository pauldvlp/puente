import { UPGRADE_URL } from '@puente/shared';
import { LicenseService } from './license.service';
import { DbService } from '../../db/db.service';

/**
 * `puente license` — read, activate or remove a license without the panel running.
 *
 * Talks to SQLite directly rather than to the HTTP API, because the most common moment to paste a
 * key is on a fresh server where nothing is up yet.
 */
export function runLicenseCommand(action: 'show' | 'activate' | 'remove', key?: string): void {
  const dbs = new DbService();
  try {
    const licenses = new LicenseService(dbs);

    if (action === 'activate') {
      if (!key) {
        console.error('Usage: puente license activate <key>');
        process.exitCode = 1;
        return;
      }
      try {
        licenses.activate(key);
      } catch (err) {
        console.error(messageOf(err));
        process.exitCode = 1;
        return;
      }
    }
    if (action === 'remove') licenses.deactivate();

    print(licenses);
    if (action !== 'show') {
      console.log('\n  Restart the panel for this to take effect:  puente restart');
    }
  } finally {
    dbs.onModuleDestroy();
  }
}

function print(licenses: LicenseService): void {
  const status = licenses.status();
  if (status.edition === 'community') {
    console.log('\n  puente Community — AGPL-3.0, unlimited nodes and routes.');
    if (status.problem) console.log(`  Stored key unusable: ${status.problem}`);
    console.log('  Pro adds team accounts, workspaces, alerts, backups and an audit log.');
    console.log(`  ${UPGRADE_URL}\n`);
    return;
  }
  console.log(`\n  puente ${status.plan?.toUpperCase()} — licensed to ${status.licensee}`);
  console.log(`  seats     : ${status.seats ?? 'unlimited'}`);
  console.log(
    `  expires   : ${status.expiresAt ? new Date(status.expiresAt).toISOString().slice(0, 10) : 'never'}` +
      (status.daysRemaining !== null ? ` (${status.daysRemaining}d)` : ''),
  );
  if (status.inGrace) console.log('  ! expired — running on the grace period');
  console.log(`  features  : ${status.features.join(', ')}\n`);
}

function messageOf(err: unknown): string {
  const response = (err as { response?: { message?: string } })?.response;
  if (response?.message) return response.message;
  return err instanceof Error ? err.message : String(err);
}
