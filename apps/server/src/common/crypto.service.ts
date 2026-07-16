import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { KEY_PATH } from '../config/paths';

/**
 * Encrypts secrets at rest (Cloudflare token, tunnel tokens) with AES-256-GCM
 * and hashes admin passwords with scrypt. The 256-bit master key lives at
 * ~/.puente/key (chmod 600) and is generated on first run.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    this.key = this.loadOrCreateKey();
  }

  private loadOrCreateKey(): Buffer {
    if (!existsSync(KEY_PATH)) {
      const key = randomBytes(32);
      writeFileSync(KEY_PATH, key, { mode: 0o600 });
      return key;
    }
    return readFileSync(KEY_PATH);
  }

  /** Returns `iv:tag:ciphertext`, all base64. */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ct].map((b) => b.toString('base64')).join(':');
  }

  decrypt(payload: string): string {
    const [iv, tag, ct] = payload.split(':').map((s) => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }

  /** Safely decrypt, returning null on tamper/format error. */
  tryDecrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    try {
      return this.decrypt(payload);
    } catch {
      return null;
    }
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16);
    const dk = scryptSync(password, salt, 64);
    return `scrypt$${salt.toString('base64')}$${dk.toString('base64')}`;
  }

  verifyPassword(password: string, stored: string): boolean {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const dk = scryptSync(password, salt, expected.length);
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  }
}
