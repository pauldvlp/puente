import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { JWT_SECRET_PATH, ensureDataDir } from './paths';

/** Load (or generate + persist) the secret used to sign session JWTs. */
export function getOrCreateJwtSecret(): string {
  ensureDataDir();
  if (existsSync(JWT_SECRET_PATH)) {
    return readFileSync(JWT_SECRET_PATH, 'utf8').trim();
  }
  const secret = randomBytes(48).toString('hex');
  writeFileSync(JWT_SECRET_PATH, secret, { mode: 0o600 });
  return secret;
}
