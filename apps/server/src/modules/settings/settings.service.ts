import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { CloudflareZone, UpdateSettingsInput } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { settings, zones, type SettingsRow, type ZoneRow } from '../../db/schema';
import { nowMs } from '../../common/time';

const APP_ID = 'app';

/** Low-level persistence for the singleton app settings + Cloudflare credentials. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  getOrInit(): SettingsRow {
    const existing = this.db.select().from(settings).where(eq(settings.id, APP_ID)).get();
    if (existing) return existing;
    const now = nowMs();
    const row: SettingsRow = {
      id: APP_ID,
      cloudflareAuthMode: null,
      cloudflareApiTokenEnc: null,
      cloudflareAccountId: null,
      cloudflareAccountName: null,
      defaultZoneId: null,
      healthPollSeconds: 30,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(settings).values(row).run();
    return row;
  }

  get(): SettingsRow {
    return this.getOrInit();
  }

  isCloudflareConnected(): boolean {
    return Boolean(this.get().cloudflareApiTokenEnc || this.get().cloudflareAuthMode === 'cert');
  }

  getCloudflareToken(): string | null {
    return this.crypto.tryDecrypt(this.get().cloudflareApiTokenEnc);
  }

  getAccountId(): string | null {
    return this.get().cloudflareAccountId;
  }

  setCloudflareToken(token: string, accountId: string, accountName: string | null): void {
    this.getOrInit();
    this.db
      .update(settings)
      .set({
        cloudflareAuthMode: 'token',
        cloudflareApiTokenEnc: this.crypto.encrypt(token),
        cloudflareAccountId: accountId,
        cloudflareAccountName: accountName,
        updatedAt: nowMs(),
      })
      .where(eq(settings.id, APP_ID))
      .run();
  }

  clearCloudflare(): void {
    this.db
      .update(settings)
      .set({
        cloudflareAuthMode: null,
        cloudflareApiTokenEnc: null,
        cloudflareAccountId: null,
        cloudflareAccountName: null,
        updatedAt: nowMs(),
      })
      .where(eq(settings.id, APP_ID))
      .run();
    this.db.delete(zones).run();
  }

  update(dto: UpdateSettingsInput): SettingsRow {
    this.getOrInit();
    const patch: Partial<SettingsRow> = { updatedAt: nowMs() };
    if (dto.defaultZoneId !== undefined) patch.defaultZoneId = dto.defaultZoneId;
    if (dto.healthPollSeconds !== undefined) patch.healthPollSeconds = dto.healthPollSeconds;
    this.db.update(settings).set(patch).where(eq(settings.id, APP_ID)).run();
    return this.get();
  }

  // --- Zone cache -----------------------------------------------------------

  saveZones(list: CloudflareZone[]): void {
    const now = nowMs();
    const tx = this.dbs.sqlite.transaction(() => {
      this.db.delete(zones).run();
      for (const z of list) {
        this.db
          .insert(zones)
          .values({
            id: z.id,
            name: z.name,
            status: z.status ?? null,
            accountId: z.accountId ?? null,
            updatedAt: now,
          })
          .run();
      }
    });
    tx();
  }

  getZones(): CloudflareZone[] {
    return this.db
      .select()
      .from(zones)
      .all()
      .map((z: ZoneRow) => ({
        id: z.id,
        name: z.name,
        status: z.status ?? undefined,
        accountId: z.accountId ?? undefined,
      }));
  }

  getZone(zoneId: string): ZoneRow | undefined {
    return this.db.select().from(zones).where(eq(zones.id, zoneId)).get();
  }
}
