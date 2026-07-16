import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { AuthToken, LoginInput, RegisterAdminInput, SessionUser } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { users, type UserRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs } from '../../common/time';

@Injectable()
export class AuthService {
  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
  ) {}

  hasAdmin(): boolean {
    return Boolean(this.dbs.db.select().from(users).limit(1).get());
  }

  async register(dto: RegisterAdminInput): Promise<AuthToken> {
    if (this.hasAdmin()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'AdminExists',
        message: 'An administrator already exists. Please sign in.',
        code: 'ADMIN_EXISTS',
      });
    }
    const row: UserRow = {
      id: newId('user'),
      username: dto.username.toLowerCase(),
      passwordHash: this.crypto.hashPassword(dto.password),
      createdAt: nowMs(),
    };
    this.dbs.db.insert(users).values(row).run();
    return this.issue(row);
  }

  async login(dto: LoginInput): Promise<AuthToken> {
    const row = this.dbs.db
      .select()
      .from(users)
      .where(eq(users.username, dto.username.toLowerCase()))
      .get();
    if (!row || !this.crypto.verifyPassword(dto.password, row.passwordHash)) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'InvalidCredentials',
        message: 'Invalid username or password.',
        code: 'INVALID_CREDENTIALS',
      });
    }
    return this.issue(row);
  }

  private issue(row: UserRow): AuthToken {
    const user: SessionUser = { id: row.id, username: row.username };
    const token = this.jwt.sign({ sub: row.id, username: row.username });
    return { token, user };
  }
}
