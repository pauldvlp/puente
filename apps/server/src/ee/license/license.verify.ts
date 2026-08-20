import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  LICENSE_GRACE_DAYS,
  LICENSE_KEY_PREFIX,
  LicensePayloadSchema,
  type LicensePayload,
  type LicenseProblem,
} from '@puente/shared';

const DAY_MS = 86_400_000;

/** A key that parsed and verified, plus how far past its expiry it is. */
export interface VerifiedLicense {
  payload: LicensePayload;
  /** Past `expiresAt` but still inside the grace window. */
  inGrace: boolean;
}

export type VerifyResult =
  { ok: true; value: VerifiedLicense } | { ok: false; problem: LicenseProblem };

/**
 * Verify a license key against a public key. Pure: no I/O, no clock of its own — which is what
 * makes expiry and the grace window testable without waiting a year.
 *
 * Key shape: `puente-lic-v1.<base64url(payload)>.<base64url(ed25519 signature)>`, signed over the
 * payload segment exactly as it appears in the string.
 */
export function verifyLicenseKey(key: string, publicKeyPem: string, now: number): VerifyResult {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== LICENSE_KEY_PREFIX) {
    // A v2 key handed to a v1 binary should say "update puente", not "this key is fake".
    if (parts.length === 3 && /^puente-lic-v\d+$/.test(parts[0])) {
      return { ok: false, problem: 'unsupported-version' };
    }
    return { ok: false, problem: 'malformed' };
  }
  const [, encodedPayload, encodedSig] = parts;

  let signatureOk: boolean;
  try {
    signatureOk = verifySignature(
      null,
      Buffer.from(encodedPayload, 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(encodedSig, 'base64url'),
    );
  } catch {
    return { ok: false, problem: 'malformed' };
  }
  if (!signatureOk) return { ok: false, problem: 'bad-signature' };

  let payload: LicensePayload;
  try {
    const json: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const parsed = LicensePayloadSchema.safeParse(json);
    if (!parsed.success) {
      const versioned = json as { v?: unknown };
      const unsupported = typeof versioned?.v === 'number' && versioned.v !== 1;
      return { ok: false, problem: unsupported ? 'unsupported-version' : 'malformed' };
    }
    payload = parsed.data;
  } catch {
    return { ok: false, problem: 'malformed' };
  }

  if (payload.expiresAt !== null) {
    const overdueMs = now - payload.expiresAt;
    if (overdueMs > LICENSE_GRACE_DAYS * DAY_MS) return { ok: false, problem: 'expired' };
    if (overdueMs > 0) return { ok: true, value: { payload, inGrace: true } };
  }
  return { ok: true, value: { payload, inGrace: false } };
}

/** Days until expiry, or — once expired — days of grace left. Null for a perpetual key. */
export function daysRemaining(
  payload: LicensePayload,
  inGrace: boolean,
  now: number,
): number | null {
  if (payload.expiresAt === null) return null;
  const deadline = inGrace ? payload.expiresAt + LICENSE_GRACE_DAYS * DAY_MS : payload.expiresAt;
  return Math.max(0, Math.ceil((deadline - now) / DAY_MS));
}
