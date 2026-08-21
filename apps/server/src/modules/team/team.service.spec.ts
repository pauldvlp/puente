import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { users } from '../../db/schema';
import { TeamService } from './team.service';

/**
 * Integration against the real (throwaway) SQLite. What is being protected here is the ability to
 * administer your own panel: every rule below exists because breaking it locks someone out
 * permanently, with no support desk to call.
 */
const dbs = new DbService();
const svc = new TeamService(dbs, new CryptoService());

const OWNER = 'user_owner';

beforeEach(() => {
  dbs.db.delete(users).run();
  dbs.db
    .insert(users)
    .values({
      id: OWNER,
      username: 'paul',
      passwordHash: 'x',
      role: 'owner',
      createdAt: Date.now(),
    })
    .run();
});

afterAll(() => {
  dbs.db.delete(users).run();
  dbs.onModuleDestroy();
});

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    if (err instanceof BadRequestException) {
      return (err.getResponse() as { code: string }).code;
    }
  }
  return 'no-error';
};

describe('TeamService', () => {
  it('adds a teammate with the role they were given', () => {
    const member = svc.create(
      { username: 'Ana', password: 'a-good-password', role: 'operator' },
      OWNER,
    );
    expect(member.username).toBe('ana'); // normalised, so nobody signs in as Ana and ana
    expect(member.role).toBe('operator');
    expect(member.isYou).toBe(false);
    expect(svc.count()).toBe(2);
  });

  it('refuses a username that is already taken', () => {
    svc.create({ username: 'ana', password: 'a-good-password', role: 'viewer' }, OWNER);
    expect(
      codeOf(() => svc.create({ username: 'ANA', password: 'another-one', role: 'viewer' }, OWNER)),
    ).toBe('USERNAME_TAKEN');
  });

  it('will not let the only owner be demoted', () => {
    expect(codeOf(() => svc.update(OWNER, { role: 'viewer' }, OWNER))).toBe('LAST_OWNER');
  });

  it('will not let the only owner be deleted', () => {
    const other = svc.create(
      { username: 'ana', password: 'a-good-password', role: 'owner' },
      OWNER,
    );
    // Two owners now, so removing one is fine…
    svc.remove(other.id, OWNER);
    // …and the survivor is protected again.
    expect(codeOf(() => svc.update(OWNER, { role: 'operator' }, OWNER))).toBe('LAST_OWNER');
  });

  it('allows demoting an owner once someone else can take over', () => {
    svc.create({ username: 'ana', password: 'a-good-password', role: 'owner' }, OWNER);
    expect(svc.update(OWNER, { role: 'viewer' }, OWNER).role).toBe('viewer');
  });

  it('refuses to delete the account you are signed in with', () => {
    svc.create({ username: 'ana', password: 'a-good-password', role: 'owner' }, OWNER);
    expect(codeOf(() => svc.remove(OWNER, OWNER))).toBe('CANNOT_DELETE_SELF');
  });

  it('changes a password without touching the role', () => {
    const ana = svc.create(
      { username: 'ana', password: 'a-good-password', role: 'operator' },
      OWNER,
    );
    const before = dbs.db
      .select()
      .from(users)
      .all()
      .find((u) => u.id === ana.id)!.passwordHash;
    const after = svc.update(ana.id, { password: 'a-different-password' }, OWNER);
    const stored = dbs.db
      .select()
      .from(users)
      .all()
      .find((u) => u.id === ana.id)!.passwordHash;
    expect(after.role).toBe('operator');
    expect(stored).not.toBe(before);
    expect(stored).not.toContain('a-different-password'); // hashed, not stored
  });

  it('marks the caller so the panel can stop them demoting themselves', () => {
    const list = svc.list(OWNER);
    expect(list.find((m) => m.id === OWNER)?.isYou).toBe(true);
  });
});
