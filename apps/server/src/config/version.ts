import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Application version, surfaced by `puente --version`, `puente info` and the setup status.
 *
 * Read from the package manifest rather than hard-coded, because a hard-coded copy is a second
 * source of truth that nothing keeps honest: this file said 0.1.0 while npm served 0.2.0, so the
 * first thing anyone checks after updating was lying to them.
 *
 * The relative path works in both layouts — `src/config/` when running from source and
 * `dist/config/` in the published package sit at the same depth under `apps/server`.
 */
function readVersion(): string {
  try {
    const manifest = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    return (JSON.parse(manifest) as { version?: string }).version ?? '0.0.0-unknown';
  } catch {
    // Never crash the CLI over a version string.
    return '0.0.0-unknown';
  }
}

export const APP_VERSION = readVersion();
