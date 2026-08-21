import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  API_TOKEN_PREFIX,
  type ApiToken,
  type CreateApiTokenInput,
  type CreatedApiToken,
  type Role,
  type SessionUser,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { apiTokens, type ApiTokenRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs, toIsoStrict } from '../../common/time';

const DAY_MS = 86_400_000;
/** 32 random bytes. Long enough that a plain hash is the right thing to store. */
const TOKEN_BYTES = 32;

/**
 * Tokens that authenticate like a user and carry a role.
 *
 * Lives in the free core because the JWT guard has to understand tokens whether or not a licence
 * is present: an expiring subscription must not silently break somebody's CI at 3am. Creating
 * them is the Pro capability, gated at the controller in `ee/`.
 *
 * Only a SHA-256 of the token is stored. A password gets scrypt because humans pick short ones;
 * a 256-bit random token has nothing to brute-force, and it is verified on every single request —
 * scrypt there would be a self-inflicted denial of service.
 */
@Injectable()
export class ApiTokenService {
  constructor(private readonly dbs: DbService) {}

  private get db() {
    return this.dbs.db;
  }

  list(): ApiToken[] {
    return this.db
      .select()
      .from(apiTokens)
      .all()
      .map((r) => toDto(r));
  }

  create(dto: CreateApiTokenInput, createdBy: SessionUser | null): CreatedApiToken {
    const secret = `${API_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
    const row: ApiTokenRow = {
      id: newId('tok'),
      name: dto.name,
      role: dto.role,
      tokenHash: hash(secret),
      // Enough to recognise it in a list, not enough to be useful to anyone who sees it.
      hint: `${secret.slice(0, API_TOKEN_PREFIX.length + 6)}…`,
      createdBy: createdBy?.username ?? null,
      createdAt: nowMs(),
      lastUsedAt: null,
      expiresAt: dto.expiresInDays ? nowMs() + dto.expiresInDays * DAY_MS : null,
    };
    this.db.insert(apiTokens).values(row).run();
    return { ...toDto(row), token: secret };
  }

  revoke(id: string): void {
    const row = this.db.select().from(apiTokens).where(eq(apiTokens.id, id)).get();
    if (!row) throw new NotFoundException(`No API token with id ${id}.`);
    this.db.delete(apiTokens).where(eq(apiTokens.id, id)).run();
  }

  /**
   * Resolve a bearer token to the identity it grants, or null.
   *
   * Deliberately keeps working without a licence: tokens already in use go on authenticating, and
   * only *creating* new ones needs Pro. Breaking a customer's automation the day their invoice
   * lapsed is not a sales tactic, it is an outage.
   */
  authenticate(presented: string): SessionUser | null {
    if (!presented.startsWith(API_TOKEN_PREFIX)) return null;

    const digest = hash(presented);
    const row = this.db.select().from(apiTokens).where(eq(apiTokens.tokenHash, digest)).get();
    if (!row) return null;

    // Compare again in constant time: the lookup above proves a row exists, not that it matches.
    const a = Buffer.from(row.tokenHash, 'hex');
    const b = Buffer.from(digest, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    if (row.expiresAt !== null && row.expiresAt < nowMs()) return null;

    this.db.update(apiTokens).set({ lastUsedAt: nowMs() }).where(eq(apiTokens.id, row.id)).run();

    return { id: row.id, username: `token:${row.name}`, role: row.role as Role };
  }
}

export function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toDto(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    hint: row.hint,
    createdAt: toIsoStrict(row.createdAt),
    createdBy: row.createdBy,
    lastUsedAt: row.lastUsedAt ? toIsoStrict(row.lastUsedAt) : null,
    expiresAt: row.expiresAt ? toIsoStrict(row.expiresAt) : null,
  };
}
