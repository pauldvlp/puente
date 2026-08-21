import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The backup file format.
 *
 * A puente backup contains the database *and* the master key, because one without the other is
 * useless: the database holds Cloudflare tokens and webhook URLs encrypted with that key. That
 * makes the file as sensitive as the server itself, so it is never written in the clear — a
 * passphrase is required, always, and the key is derived with scrypt rather than used directly.
 *
 * Layout, all binary, in one file:
 *
 *   magic    8 bytes   "PUENTEBK"
 *   version  1 byte    format version
 *   salt     16 bytes  scrypt salt
 *   iv       12 bytes  AES-GCM nonce
 *   tag      16 bytes  AES-GCM auth tag
 *   payload  n bytes   ciphertext of the JSON body
 */

export const MAGIC = Buffer.from('PUENTEBK', 'utf8');
export const FORMAT_VERSION = 1;

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
/**
 * scrypt parameters. N=2^15 keeps guessing a passphrase expensive without making a restore slow.
 *
 * `maxmem` is not optional here: 128 * N * r is ~33.5 MB and Node's default ceiling is 32 MB, so
 * without it every backup fails with "memory limit exceeded" — on the user's machine, at the
 * moment they were trying to protect themselves.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;

export interface BackupBody {
  /** puente version that wrote it, for a human reading a file from a year ago. */
  version: string;
  createdAt: string;
  /** The SQLite file. */
  database: string;
  /** The AES master key, without which the database's secrets cannot be read. */
  masterKey: string;
  /** JWT signing secret: restoring without it silently logs everyone out. */
  jwtSecret: string | null;
}

export class BackupError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export function seal(body: BackupBody, passphrase: string): Buffer {
  if (!passphrase) {
    throw new BackupError(
      'A passphrase is required — a backup holds your Cloudflare tokens.',
      'NO_PASSPHRASE',
    );
  }
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = scryptSync(passphrase, salt, SCRYPT.keylen, SCRYPT);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(body), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    salt,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

export function open(file: Buffer, passphrase: string): BackupBody {
  if (file.length < MAGIC.length + 1 + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new BackupError('That file is not a puente backup.', 'NOT_A_BACKUP');
  }
  if (!timingSafeEqual(file.subarray(0, MAGIC.length), MAGIC)) {
    throw new BackupError('That file is not a puente backup.', 'NOT_A_BACKUP');
  }

  let offset = MAGIC.length;
  const version = file[offset];
  offset += 1;
  if (version !== FORMAT_VERSION) {
    // A newer puente wrote it. Say so, rather than blaming the passphrase.
    throw new BackupError(
      `This backup uses format version ${version}; this puente reads version ${FORMAT_VERSION}. Update puente and try again.`,
      'UNSUPPORTED_VERSION',
    );
  }

  const salt = file.subarray(offset, (offset += SALT_LEN));
  const iv = file.subarray(offset, (offset += IV_LEN));
  const tag = file.subarray(offset, (offset += TAG_LEN));
  const ciphertext = file.subarray(offset);

  const key = scryptSync(passphrase, salt, SCRYPT.keylen, SCRYPT);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // GCM cannot tell a wrong passphrase from a corrupted file, and neither can we.
    throw new BackupError(
      'Wrong passphrase, or the file has been altered since it was written.',
      'BAD_PASSPHRASE',
    );
  }

  try {
    return JSON.parse(plaintext.toString('utf8')) as BackupBody;
  } catch {
    throw new BackupError('The backup decrypted but its contents are not readable.', 'CORRUPT');
  }
}
