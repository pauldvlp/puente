import { describe, it, expect } from 'vitest';
import { BackupError, FORMAT_VERSION, MAGIC, open, seal, type BackupBody } from './backup.format';

const body = (over: Partial<BackupBody> = {}): BackupBody => ({
  version: '0.4.0',
  createdAt: '2026-08-21T12:00:00.000Z',
  database: Buffer.from('sqlite bytes here').toString('base64'),
  masterKey: Buffer.alloc(32, 7).toString('base64'),
  jwtSecret: 'jwt-secret',
  ...over,
});

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof BackupError) return err.code;
  }
  return 'no-error';
};

describe('backup format', () => {
  it('round-trips everything needed to bring an install back', () => {
    const sealed = seal(body(), 'correct horse battery staple');
    const opened = open(sealed, 'correct horse battery staple');
    expect(opened).toEqual(body());
  });

  it('refuses to write an unprotected backup', () => {
    // The file holds Cloudflare tokens and SSH-adjacent secrets; there is no "just this once".
    expect(codeOf(() => seal(body(), ''))).toBe('NO_PASSPHRASE');
  });

  it('rejects the wrong passphrase without hinting at the right one', () => {
    const sealed = seal(body(), 'the real one');
    expect(codeOf(() => open(sealed, 'a guess'))).toBe('BAD_PASSPHRASE');
  });

  it('detects a file altered after it was written', () => {
    const sealed = seal(body(), 'passphrase');
    // Flip a byte in the ciphertext; GCM must notice.
    sealed[sealed.length - 5] ^= 0xff;
    expect(codeOf(() => open(sealed, 'passphrase'))).toBe('BAD_PASSPHRASE');
  });

  it('says "not a backup" for something that never was one', () => {
    expect(codeOf(() => open(Buffer.from('hello world, at length'), 'x'))).toBe('NOT_A_BACKUP');
    expect(codeOf(() => open(Buffer.alloc(4), 'x'))).toBe('NOT_A_BACKUP');
  });

  it('blames the version, not the passphrase, when a newer puente wrote it', () => {
    const sealed = seal(body(), 'passphrase');
    sealed[MAGIC.length] = FORMAT_VERSION + 1;
    expect(codeOf(() => open(sealed, 'passphrase'))).toBe('UNSUPPORTED_VERSION');
  });

  it('produces a different file every time, even for identical input', () => {
    // Fresh salt and nonce per backup: two files of the same database must not be comparable.
    const a = seal(body(), 'passphrase');
    const b = seal(body(), 'passphrase');
    expect(a.equals(b)).toBe(false);
  });

  it('starts with the magic bytes, so `file` and a human can identify it', () => {
    expect(seal(body(), 'passphrase').subarray(0, 8).toString('utf8')).toBe('PUENTEBK');
  });
});
