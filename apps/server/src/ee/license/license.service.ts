import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  COMMUNITY_STATUS,
  type LicenseProblem,
  type LicenseStatus,
  type ProFeature,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { license } from '../../db/schema';
import { nowMs } from '../../common/time';
import { LICENSE_PUBLIC_KEY_PEM } from './license.keys';
import { daysRemaining, verifyLicenseKey, type VerifiedLicense } from './license.verify';

const ROW_ID = 'current';

/**
 * Offline license verification for puente Pro. Nothing is ever fetched: the signing key's public
 * half is compiled in, so puente works the same on an air-gapped network as on a laptop.
 *
 * Expiry is deliberately gentle. For LICENSE_GRACE_DAYS past `expiresAt` the key keeps working and
 * the UI nags; after that Pro features go quiet — and *only* that. Tunnels, routes, nodes and the
 * CLI are AGPL and never call into this file, so a lapsed subscription cannot take an origin down.
 */
@Injectable()
export class LicenseService {
  private readonly log = new Logger('License');
  private cached: VerifiedLicense | null = null;
  private problem: LicenseProblem | null = null;

  constructor(private readonly dbs: DbService) {
    this.reload();
  }

  /** True when a valid (or in-grace) key unlocks `feature`. */
  has(feature: ProFeature): boolean {
    return this.cached?.payload.features.includes(feature) ?? false;
  }

  get edition(): 'community' | 'pro' {
    return this.cached ? 'pro' : 'community';
  }

  /** Seat cap for the `team` feature. Null means unlimited, or Community (which has one user). */
  get seats(): number | null {
    return this.cached?.payload.seats ?? null;
  }

  status(): LicenseStatus {
    if (!this.cached) return { ...COMMUNITY_STATUS, problem: this.problem };
    const { payload, inGrace } = this.cached;
    return {
      edition: 'pro',
      licensee: payload.licensee,
      plan: payload.plan,
      features: payload.features,
      seats: payload.seats,
      nodes: payload.nodes,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null,
      inGrace,
      daysRemaining: daysRemaining(payload, inGrace, nowMs()),
      problem: null,
    };
  }

  /** Verify and persist a key. Throws with a user-facing message when it does not check out. */
  activate(key: string): LicenseStatus {
    const trimmed = key.trim();
    const result = verifyLicenseKey(trimmed, LICENSE_PUBLIC_KEY_PEM, nowMs());
    if (!result.ok) throw new BadRequestException(problemResponse(result.problem));

    const now = nowMs();
    this.dbs.db.delete(license).run();
    this.dbs.db
      .insert(license)
      .values({
        id: ROW_ID,
        key: trimmed,
        licenseId: result.value.payload.id,
        activatedAt: now,
        updatedAt: now,
      })
      .run();
    this.cached = result.value;
    this.problem = null;
    const { plan, licensee } = result.value.payload;
    this.log.log(`Activated ${plan} license for ${licensee}`);
    return this.status();
  }

  /** Drop the stored key and fall back to Community. Touches nothing else. */
  deactivate(): LicenseStatus {
    this.dbs.db.delete(license).where(eq(license.id, ROW_ID)).run();
    this.cached = null;
    this.problem = null;
    this.log.log('License removed — running as Community.');
    return this.status();
  }

  /** Re-read the key from the environment (PUENTE_LICENSE_KEY, for Docker) or the database. */
  reload(): void {
    const stored = process.env.PUENTE_LICENSE_KEY?.trim() || this.storedKey();
    if (!stored) {
      this.cached = null;
      this.problem = null;
      return;
    }
    const result = verifyLicenseKey(stored, LICENSE_PUBLIC_KEY_PEM, nowMs());
    if (!result.ok) {
      this.cached = null;
      this.problem = result.problem;
      this.log.warn(`Stored license key is not usable (${result.problem}) — running as Community.`);
      return;
    }
    this.cached = result.value;
    this.problem = null;
    if (result.value.inGrace) {
      const left = daysRemaining(result.value.payload, true, nowMs()) ?? 0;
      this.log.warn(
        `License for ${result.value.payload.licensee} expired — Pro features keep working for ` +
          `${left} more day(s).`,
      );
    }
  }

  private storedKey(): string | null {
    return this.dbs.db.select().from(license).where(eq(license.id, ROW_ID)).get()?.key ?? null;
  }
}

const MESSAGES: Record<LicenseProblem, string> = {
  malformed: 'That does not look like a puente license key. Paste the whole key from your email.',
  'bad-signature': 'This license key failed verification. Check it was copied in full.',
  'unsupported-version':
    'This key was issued for a newer version of puente. Update puente and try again.',
  expired: 'This license key has expired. Renew it to keep using Pro features.',
};

function problemResponse(problem: LicenseProblem) {
  return {
    statusCode: 400,
    error: 'InvalidLicense',
    message: MESSAGES[problem],
    code: `LICENSE_${problem.toUpperCase().replace(/-/g, '_')}`,
  };
}
