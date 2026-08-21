import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { API_TOKEN_PREFIX } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { apiTokens } from '../../db/schema';
import { ApiTokenService } from './api-token.service';

const dbs = new DbService();
const svc = new ApiTokenService(dbs);
const owner = { id: 'user_1', username: 'paul', role: 'owner' as const };

beforeEach(() => {
  dbs.db.delete(apiTokens).run();
});

afterAll(() => {
  dbs.db.delete(apiTokens).run();
  dbs.onModuleDestroy();
});

describe('ApiTokenService', () => {
  it('returns the secret once and never stores it', () => {
    const created = svc.create({ name: 'ci', role: 'operator' }, owner);

    expect(created.token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(created.token.length).toBeGreaterThan(40);

    // Nothing in the row resembles the token except a short hint.
    const row = dbs.db.select().from(apiTokens).all()[0];
    expect(row.tokenHash).not.toContain(created.token);
    expect(JSON.stringify(row)).not.toContain(created.token.slice(10));
    expect(created.hint.length).toBeLessThan(created.token.length);

    // And it is not in the listing either.
    expect(JSON.stringify(svc.list())).not.toContain(created.token.slice(10));
  });

  it('authenticates a token with the role it was given', () => {
    const created = svc.create({ name: 'ci', role: 'viewer' }, owner);
    const identity = svc.authenticate(created.token);

    expect(identity).toMatchObject({ role: 'viewer' });
    // The username makes it obvious in an audit trail that a machine did this, not a person.
    expect(identity?.username).toBe('token:ci');
  });

  it('refuses anything that is not a token it issued', () => {
    svc.create({ name: 'ci', role: 'owner' }, owner);
    expect(svc.authenticate('pnt_not-a-real-token')).toBeNull();
    expect(svc.authenticate('')).toBeNull();
    // A JWT must fall through to the JWT path, not be treated as an API token.
    expect(svc.authenticate('eyJhbGciOiJIUzI1NiJ9.e30.x')).toBeNull();
  });

  it('stops accepting a token once it has expired', () => {
    const created = svc.create({ name: 'ci', role: 'owner', expiresInDays: 1 }, owner);
    expect(svc.authenticate(created.token)).not.toBeNull();

    // Reach in and age it, rather than waiting a day.
    dbs.db
      .update(apiTokens)
      .set({ expiresAt: Date.now() - 1000 })
      .run();
    expect(svc.authenticate(created.token)).toBeNull();
  });

  it('records when a token was last used, so dead ones can be spotted', () => {
    const created = svc.create({ name: 'ci', role: 'operator' }, owner);
    expect(svc.list()[0].lastUsedAt).toBeNull();

    svc.authenticate(created.token);
    expect(svc.list()[0].lastUsedAt).not.toBeNull();
  });

  it('stops working the moment it is revoked', () => {
    const created = svc.create({ name: 'ci', role: 'operator' }, owner);
    svc.revoke(created.id);

    expect(svc.authenticate(created.token)).toBeNull();
    expect(svc.list()).toHaveLength(0);
  });

  it('issues a different secret every time', () => {
    const a = svc.create({ name: 'one', role: 'viewer' }, owner);
    const b = svc.create({ name: 'two', role: 'viewer' }, owner);
    expect(a.token).not.toBe(b.token);
  });

  it('records who issued it', () => {
    const created = svc.create({ name: 'ci', role: 'viewer' }, owner);
    expect(created.createdBy).toBe('paul');
  });
});
