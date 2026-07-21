import { describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';

// No Nest DI needed — the constructor only loads/creates the master key, and the
// suite points PUENTE_DATA_DIR at a throwaway dir (see vitest.config.ts).
const crypto = new CryptoService();

describe('secret encryption (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const secret = 'cf-token-abc123';
    expect(crypto.decrypt(crypto.encrypt(secret))).toBe(secret);
  });

  it('emits iv:tag:ciphertext and never the plaintext', () => {
    const payload = crypto.encrypt('super-secret');
    expect(payload.split(':')).toHaveLength(3);
    expect(payload).not.toContain('super-secret');
  });

  it('uses a fresh IV, so the same plaintext encrypts differently each time', () => {
    expect(crypto.encrypt('same')).not.toBe(crypto.encrypt('same'));
  });

  it('refuses a tampered payload — the auth tag is the point of GCM', () => {
    const [iv, tag, ct] = crypto.encrypt('do-not-touch').split(':');
    // flip the last ciphertext byte
    const raw = Buffer.from(ct, 'base64');
    raw[raw.length - 1] ^= 0xff;
    const tampered = [iv, tag, raw.toString('base64')].join(':');

    expect(() => crypto.decrypt(tampered)).toThrow();
    expect(crypto.tryDecrypt(tampered)).toBeNull();
  });

  it('tryDecrypt swallows empty and malformed input', () => {
    expect(crypto.tryDecrypt(null)).toBeNull();
    expect(crypto.tryDecrypt(undefined)).toBeNull();
    expect(crypto.tryDecrypt('')).toBeNull();
    expect(crypto.tryDecrypt('not-a-payload')).toBeNull();
  });
});

describe('password hashing (scrypt)', () => {
  it('verifies the right password and rejects the wrong one', () => {
    const stored = crypto.hashPassword('correct horse');
    expect(crypto.verifyPassword('correct horse', stored)).toBe(true);
    expect(crypto.verifyPassword('wrong horse', stored)).toBe(false);
  });

  it('salts, so the same password never hashes to the same string', () => {
    expect(crypto.hashPassword('same')).not.toBe(crypto.hashPassword('same'));
  });

  it('never stores the password in the clear', () => {
    expect(crypto.hashPassword('plaintext-pw')).not.toContain('plaintext-pw');
  });

  it('rejects malformed stored values instead of throwing', () => {
    for (const bad of ['', 'nonsense', 'bcrypt$salt$hash', 'scrypt$only-two']) {
      expect(crypto.verifyPassword('x', bad), bad).toBe(false);
    }
  });
});
