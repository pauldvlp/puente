import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import {
  SSO_DOMAIN_REFUSED,
  type AuthToken,
  SSO_NOT_CONFIGURED,
  type Role,
  type SsoConfig,
  type SsoStatus,
  type UpdateSsoConfigInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { ssoConfig, users, type SsoConfigRow, type UserRow } from '../../db/schema';
import { AuthService } from '../../modules/auth/auth.service';
import { TeamService } from '../../modules/team/team.service';
import { EventsService } from '../../modules/events/events.service';
import { LicenseService } from '../license/license.service';
import { newId } from '../../common/ids';
import { nowMs } from '../../common/time';

const ROW_ID = 'current';
/** A login that takes longer than this was abandoned. */
const FLOW_TTL_MS = 10 * 60_000;
/** The one-time code handed back to the browser is swapped immediately. */
const HANDOFF_TTL_MS = 60_000;

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

interface PendingFlow {
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  at: number;
}

@Injectable()
export class SsoService {
  private readonly log = new Logger('SSO');
  /** state -> flow. In-process is right here: the panel is one process, and a lost flow just
   *  means signing in again. */
  private readonly flows = new Map<string, PendingFlow>();
  /** one-time code -> the issued session, so the JWT never travels in a URL. */
  private readonly handoffs = new Map<string, { session: AuthToken; at: number }>();
  private discovery: { issuer: string; doc: Discovery; at: number } | null = null;
  private jwks: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;

  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
    private readonly auth: AuthService,
    private readonly team: TeamService,
    private readonly events: EventsService,
    private readonly licenses: LicenseService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  row(): SsoConfigRow {
    const existing = this.db.select().from(ssoConfig).where(eq(ssoConfig.id, ROW_ID)).get();
    if (existing) return existing;
    const now = nowMs();
    const row: SsoConfigRow = {
      id: ROW_ID,
      enabled: false,
      label: 'SSO',
      issuer: '',
      clientId: '',
      clientSecretEnc: null,
      allowedDomain: '',
      defaultRole: 'viewer',
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(ssoConfig).values(row).run();
    return row;
  }

  /** All the login screen is told, and all it needs. */
  status(): SsoStatus {
    const row = this.row();
    return { enabled: row.enabled && Boolean(row.issuer && row.clientId), label: row.label };
  }

  config(redirectUri: string): SsoConfig {
    const row = this.row();
    return {
      enabled: row.enabled,
      label: row.label,
      issuer: row.issuer,
      clientId: row.clientId,
      hasClientSecret: Boolean(row.clientSecretEnc),
      allowedDomain: row.allowedDomain,
      defaultRole: row.defaultRole as Role,
      redirectUri,
      lastError: row.lastError,
    };
  }

  update(dto: UpdateSsoConfigInput, redirectUri: string): SsoConfig {
    const current = this.row();
    const patch: Partial<SsoConfigRow> = { updatedAt: nowMs() };
    if (dto.label !== undefined) patch.label = dto.label;
    if (dto.issuer !== undefined) patch.issuer = dto.issuer.replace(/\/$/, '');
    if (dto.clientId !== undefined) patch.clientId = dto.clientId;
    if (dto.allowedDomain !== undefined)
      patch.allowedDomain = dto.allowedDomain.trim().toLowerCase();
    if (dto.defaultRole !== undefined) patch.defaultRole = dto.defaultRole;
    if (dto.clientSecret !== undefined) {
      patch.clientSecretEnc = dto.clientSecret ? this.crypto.encrypt(dto.clientSecret) : null;
    }

    if (dto.enabled === true) {
      // Enabling with half a configuration would put a button on the login screen that leads
      // nowhere — for everyone, including the person who is not yet signed in.
      const issuer = dto.issuer ?? current.issuer;
      const clientId = dto.clientId ?? current.clientId;
      const secret = dto.clientSecret ?? (current.clientSecretEnc ? 'kept' : '');
      if (!issuer || !clientId || !secret) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'SsoIncomplete',
          message: 'Set the issuer, client ID and client secret before turning SSO on.',
          code: SSO_NOT_CONFIGURED,
        });
      }
      patch.enabled = true;
      patch.lastError = null;
    } else if (dto.enabled === false) {
      patch.enabled = false;
    }

    this.db.update(ssoConfig).set(patch).where(eq(ssoConfig.id, ROW_ID)).run();
    this.discovery = null; // the issuer may have changed
    this.jwks = null;
    return this.config(redirectUri);
  }

  /** Where to send the browser to start a login. */
  async authorizationUrl(redirectUri: string): Promise<string> {
    const row = this.requireConfigured();
    const doc = await this.discover(row.issuer);

    const state = randomBytes(16).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');

    this.sweep();
    this.flows.set(state, { nonce, codeVerifier, redirectUri, at: nowMs() });

    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', row.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * Finish the login. Returns a one-time code for the browser to swap for a session token, so
   * the token itself never lands in a URL, a browser history or a proxy log.
   */
  async callback(code: string, state: string): Promise<string> {
    const flow = this.flows.get(state);
    // An unknown state is either a replay or a login that took longer than ten minutes.
    if (!flow) throw new UnauthorizedException('That sign-in expired. Try again.');
    this.flows.delete(state);

    const row = this.requireConfigured();
    const doc = await this.discover(row.issuer);
    const secret = this.crypto.tryDecrypt(row.clientSecretEnc);
    if (!secret)
      throw new BadRequestException('The client secret could not be read. Set it again.');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: flow.redirectUri,
      client_id: row.clientId,
      client_secret: secret,
      code_verifier: flow.codeVerifier,
    });

    const res = await fetch(doc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const detail = await res.text();
      this.fail(`Token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
      throw new UnauthorizedException('The identity provider rejected the sign-in.');
    }
    const tokens = (await res.json()) as { id_token?: string };
    if (!tokens.id_token) {
      this.fail('The identity provider returned no id_token.');
      throw new UnauthorizedException('The identity provider returned no identity.');
    }

    const claims = await this.verify(tokens.id_token, doc, row.clientId, flow.nonce);
    const user = this.upsert(claims, row);

    const handoff = randomUUID();
    this.handoffs.set(handoff, { session: this.auth.issueFor(user), at: nowMs() });
    return handoff;
  }

  /** Swap the one-time code for the session. Single use, and short-lived. */
  redeem(code: string): AuthToken {
    this.sweep();
    const entry = this.handoffs.get(code);
    if (!entry) throw new UnauthorizedException('That sign-in link has already been used.');
    this.handoffs.delete(code);
    return entry.session;
  }

  // --- internals ------------------------------------------------------------

  private async verify(
    idToken: string,
    doc: Discovery,
    clientId: string,
    nonce: string,
  ): Promise<{ email?: string; sub: string; nonce?: string; name?: string }> {
    if (!this.jwks || this.jwks.uri !== doc.jwks_uri) {
      this.jwks = { uri: doc.jwks_uri, set: createRemoteJWKSet(new URL(doc.jwks_uri)) };
    }
    const { payload } = await jwtVerify(idToken, this.jwks.set, {
      issuer: doc.issuer,
      audience: clientId,
    });
    // The nonce is what ties this token to the login we started, so a replayed one is rejected.
    if (payload.nonce !== nonce) {
      throw new UnauthorizedException('That sign-in could not be verified.');
    }
    return payload as { email?: string; sub: string; nonce?: string; name?: string };
  }

  private upsert(
    claims: { email?: string; sub: string; name?: string },
    row: SsoConfigRow,
  ): UserRow {
    const email = (claims.email ?? '').toLowerCase();
    if (!email) throw new UnauthorizedException('The identity provider did not share an email.');

    if (row.allowedDomain && !email.endsWith(`@${row.allowedDomain}`)) {
      this.events.warn('sso.refused', `Refused ${email}: outside ${row.allowedDomain}`);
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'DomainRefused',
        message: `Only ${row.allowedDomain} accounts can sign in here.`,
        code: SSO_DOMAIN_REFUSED,
      });
    }

    const username = email;
    const existing = this.db.select().from(users).where(eq(users.username, username)).get();
    if (existing) return existing;

    // Seats are counted the same whether an account was typed in or arrived through the identity
    // provider; silently exceeding the licence because the door is a different one is not a
    // reasonable reading of "5 seats".
    const seats = this.licenses.seats;
    if (seats !== null && this.team.count() >= seats) {
      this.events.warn('sso.refused', `Refused ${email}: every seat on the licence is in use`);
      throw new UnauthorizedException(
        `Every seat on this licence is in use, so ${email} could not be added.`,
      );
    }

    // A first sign-in creates the account, with the role the owner chose for newcomers.
    const created: UserRow = {
      id: newId('user'),
      username,
      // No password: this account exists to be signed into through the provider. The hash is
      // random so the password path can never match it.
      passwordHash: this.crypto.hashPassword(randomBytes(32).toString('base64url')),
      role: row.defaultRole,
      createdAt: nowMs(),
    };
    this.db.insert(users).values(created).run();
    this.events.success('sso.signup', `${email} signed in for the first time via SSO`);
    return created;
  }

  private requireConfigured(): SsoConfigRow {
    const row = this.row();
    if (!row.enabled || !row.issuer || !row.clientId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'SsoNotConfigured',
        message: 'Single sign-on is not set up here.',
        code: SSO_NOT_CONFIGURED,
      });
    }
    return row;
  }

  private async discover(issuer: string): Promise<Discovery> {
    if (this.discovery && this.discovery.issuer === issuer) return this.discovery.doc;
    const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await fetch(url);
    if (!res.ok) {
      this.fail(`Could not read ${url} (${res.status}).`);
      throw new BadRequestException(`The issuer did not answer at ${url}.`);
    }
    const doc = (await res.json()) as Discovery;
    if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
      this.fail(`${url} is missing endpoints.`);
      throw new BadRequestException('That issuer does not look like an OIDC provider.');
    }
    this.discovery = { issuer, doc, at: nowMs() };
    return doc;
  }

  private fail(message: string): void {
    this.log.warn(message);
    this.db
      .update(ssoConfig)
      .set({ lastError: message, updatedAt: nowMs() })
      .where(eq(ssoConfig.id, ROW_ID))
      .run();
  }

  /** Drop anything abandoned, so neither map grows without bound. */
  private sweep(): void {
    const now = nowMs();
    for (const [key, flow] of this.flows) {
      if (now - flow.at > FLOW_TTL_MS) this.flows.delete(key);
    }
    for (const [key, entry] of this.handoffs) {
      if (now - entry.at > HANDOFF_TTL_MS) this.handoffs.delete(key);
    }
  }
}
