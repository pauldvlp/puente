import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CloudflareZone, UpdateSettingsInput } from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { settings, zones, type SettingsRow, type ZoneRow } from '../../db/schema';
import { nowMs } from '../../common/time';
import { WorkspacesService } from '../workspaces/workspaces.service';

const APP_ID = 'app';

/**
 * App-wide preferences, plus the Cloudflare connection of whichever workspace the caller is in.
 *
 * The connection used to be stored here, one per install. It now lives on the workspace, but this
 * service keeps the same shape so nodes, routes and the Cloudflare client did not have to learn
 * about workspaces at all — they ask for "the token" and get the right one.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
    private readonly workspaces: WorkspacesService,
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

  // --- Cloudflare connection (per workspace) --------------------------------

  isCloudflareConnected(): boolean {
    const ws = this.workspaces.current();
    return Boolean(ws.cloudflareApiTokenEnc || ws.cloudflareAuthMode === 'cert');
  }

  getCloudflareToken(): string | null {
    return this.crypto.tryDecrypt(this.workspaces.current().cloudflareApiTokenEnc);
  }

  getAccountId(): string | null {
    return this.workspaces.current().cloudflareAccountId;
  }

  getDefaultZoneId(): string | null {
    return this.workspaces.current().defaultZoneId;
  }

  setCloudflareToken(token: string, accountId: string, accountName: string | null): void {
    const ws = this.workspaces.current();
    this.workspaces.patch(ws.id, {
      cloudflareAuthMode: 'token',
      cloudflareApiTokenEnc: this.crypto.encrypt(token),
      cloudflareAccountId: accountId,
      cloudflareAccountName: accountName,
      // A workspace still called "Default" takes the account's name once we know it.
      name: ws.name === 'Default' && accountName ? accountName : ws.name,
    });
  }

  clearCloudflare(): void {
    const ws = this.workspaces.current();
    this.workspaces.patch(ws.id, {
      cloudflareAuthMode: null,
      cloudflareApiTokenEnc: null,
      cloudflareAccountId: null,
      cloudflareAccountName: null,
      defaultZoneId: null,
    });
    this.db.delete(zones).where(eq(zones.workspaceId, ws.id)).run();
  }

  update(dto: UpdateSettingsInput): SettingsRow {
    this.getOrInit();
    if (dto.healthPollSeconds !== undefined) {
      this.db
        .update(settings)
        .set({ healthPollSeconds: dto.healthPollSeconds, updatedAt: nowMs() })
        .where(eq(settings.id, APP_ID))
        .run();
    }
    if (dto.defaultZoneId !== undefined) {
      this.workspaces.patch(this.workspaces.currentId(), { defaultZoneId: dto.defaultZoneId });
    }
    return this.get();
  }

  // --- Zone cache (per workspace) -------------------------------------------

  saveZones(list: CloudflareZone[]): void {
    const now = nowMs();
    const workspaceId = this.workspaces.currentId();
    const tx = this.dbs.sqlite.transaction(() => {
      this.db.delete(zones).where(eq(zones.workspaceId, workspaceId)).run();
      for (const z of list) {
        this.db
          .insert(zones)
          .values({
            id: z.id,
            workspaceId,
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
      .where(eq(zones.workspaceId, this.workspaces.currentId()))
      .all()
      .map((z: ZoneRow) => ({
        id: z.id,
        name: z.name,
        status: z.status ?? undefined,
        accountId: z.accountId ?? undefined,
      }));
  }

  getZone(zoneId: string): ZoneRow | undefined {
    return this.db
      .select()
      .from(zones)
      .where(and(eq(zones.id, zoneId), eq(zones.workspaceId, this.workspaces.currentId())))
      .get();
  }
}
