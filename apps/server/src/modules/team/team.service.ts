import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  LAST_OWNER,
  type CreateTeamMemberInput,
  type Role,
  type TeamMember,
  type UpdateTeamMemberInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { users, type UserRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs, toIsoStrict } from '../../common/time';

/**
 * The accounts that can sign in to this panel.
 *
 * Lives in the free core because every install has one account and listing or renaming it is not
 * something to sell. Creating a *second* one is the Pro capability, gated at the controller in
 * `ee/` where the licence lives.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  list(currentUserId: string): TeamMember[] {
    return this.db
      .select()
      .from(users)
      .all()
      .map((u) => this.toDto(u, currentUserId));
  }

  count(): number {
    return this.db.select().from(users).all().length;
  }

  create(dto: CreateTeamMemberInput, currentUserId: string): TeamMember {
    const username = dto.username.toLowerCase();
    if (this.db.select().from(users).where(eq(users.username, username)).get()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'UsernameTaken',
        message: `Someone is already called ${username}.`,
        code: 'USERNAME_TAKEN',
      });
    }
    const row: UserRow = {
      id: newId('user'),
      username,
      passwordHash: this.crypto.hashPassword(dto.password),
      role: dto.role,
      createdAt: nowMs(),
    };
    this.db.insert(users).values(row).run();
    return this.toDto(row, currentUserId);
  }

  update(id: string, dto: UpdateTeamMemberInput, currentUserId: string): TeamMember {
    const row = this.getRow(id);
    const patch: Partial<UserRow> = {};
    if (dto.password !== undefined) patch.passwordHash = this.crypto.hashPassword(dto.password);
    if (dto.role !== undefined && dto.role !== row.role) {
      if (row.role === 'owner') this.assertNotLastOwner(id);
      patch.role = dto.role;
    }
    if (Object.keys(patch).length) {
      this.db.update(users).set(patch).where(eq(users.id, id)).run();
    }
    return this.toDto(this.getRow(id), currentUserId);
  }

  remove(id: string, currentUserId: string): void {
    const row = this.getRow(id);
    // Deleting yourself locks you out of your own panel, and there is no support desk.
    if (id === currentUserId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CannotDeleteSelf',
        message: 'You cannot delete the account you are signed in with.',
        code: 'CANNOT_DELETE_SELF',
      });
    }
    if (row.role === 'owner') this.assertNotLastOwner(id);
    this.db.delete(users).where(eq(users.id, id)).run();
  }

  /** An install with no owner can never be administered again, so this is a hard floor. */
  private assertNotLastOwner(id: string): void {
    const owners = this.db
      .select()
      .from(users)
      .all()
      .filter((u) => u.role === 'owner' && u.id !== id);
    if (owners.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'LastOwner',
        message: 'This is the only owner. Promote someone else first.',
        code: LAST_OWNER,
      });
    }
  }

  private getRow(id: string): UserRow {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!row) throw new NotFoundException(`No account with id ${id}.`);
    return row;
  }

  private toDto(row: UserRow, currentUserId: string): TeamMember {
    return {
      id: row.id,
      username: row.username,
      role: row.role as Role,
      createdAt: toIsoStrict(row.createdAt),
      isYou: row.id === currentUserId,
    };
  }
}
