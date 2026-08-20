import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  type AlertChannel,
  type AlertChannelKind,
  type AlertDelivery,
  type AlertPayload,
  type AlertTrigger,
  type CreateAlertChannelInput,
  type UpdateAlertChannelInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { alertChannels, type AlertChannelRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs, toIsoStrict } from '../../common/time';

/** How long we wait on a webhook before giving up. Chat providers answer in well under a second. */
const DELIVERY_TIMEOUT_MS = 8_000;

@Injectable()
export class AlertsService {
  private readonly log = new Logger('Alerts');

  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  list(): AlertChannel[] {
    return this.db
      .select()
      .from(alertChannels)
      .all()
      .map((r) => this.toDto(r));
  }

  create(dto: CreateAlertChannelInput): AlertChannel {
    const now = nowMs();
    const row: AlertChannelRow = {
      id: newId('alrt'),
      name: dto.name,
      kind: dto.kind,
      urlEnc: this.crypto.encrypt(dto.url),
      enabled: dto.enabled,
      triggers: dto.triggers,
      cooldown: {},
      lastDeliveryAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(alertChannels).values(row).run();
    return this.toDto(row);
  }

  update(id: string, dto: UpdateAlertChannelInput): AlertChannel {
    this.getRow(id);
    const patch: Partial<AlertChannelRow> = { updatedAt: nowMs() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.url !== undefined) patch.urlEnc = this.crypto.encrypt(dto.url);
    if (dto.triggers !== undefined) patch.triggers = dto.triggers;
    if (dto.enabled !== undefined) patch.enabled = dto.enabled;
    this.db.update(alertChannels).set(patch).where(eq(alertChannels.id, id)).run();
    return this.toDto(this.getRow(id));
  }

  remove(id: string): void {
    this.getRow(id);
    this.db.delete(alertChannels).where(eq(alertChannels.id, id)).run();
  }

  /** Channels that asked to hear about this trigger and are switched on. */
  subscribersOf(trigger: AlertTrigger): AlertChannelRow[] {
    return this.db
      .select()
      .from(alertChannels)
      .all()
      .filter((c) => c.enabled && c.triggers.includes(trigger));
  }

  lastNotified(row: AlertChannelRow, subjectId: string): number | null {
    return row.cooldown?.[subjectId] ?? null;
  }

  markNotified(id: string, subjectId: string, at: number): void {
    const row = this.getRow(id);
    this.db
      .update(alertChannels)
      .set({ cooldown: { ...(row.cooldown ?? {}), [subjectId]: at }, updatedAt: nowMs() })
      .where(eq(alertChannels.id, id))
      .run();
  }

  /** Fire a channel with a payload. Never throws — a broken webhook must not break a poll tick. */
  async deliver(row: AlertChannelRow, payload: AlertPayload): Promise<AlertDelivery> {
    const url = this.crypto.tryDecrypt(row.urlEnc);
    if (!url) {
      return this.record(row.id, {
        ok: false,
        httpStatus: null,
        message: 'The stored URL could not be decrypted. Re-enter it.',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFor(row.kind as AlertChannelKind, payload)),
        signal: controller.signal,
      });
      const ok = res.status >= 200 && res.status < 300;
      return this.record(row.id, {
        ok,
        httpStatus: res.status,
        message: ok ? 'Delivered' : `The endpoint answered HTTP ${res.status}.`,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return this.record(row.id, {
        ok: false,
        httpStatus: null,
        message: aborted
          ? `No answer within ${DELIVERY_TIMEOUT_MS / 1000}s.`
          : err instanceof Error
            ? err.message
            : String(err),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  getRow(id: string): AlertChannelRow {
    const row = this.db.select().from(alertChannels).where(eq(alertChannels.id, id)).get();
    if (!row) throw new NotFoundException(`No alert channel with id ${id}.`);
    return row;
  }

  private toDto(row: AlertChannelRow): AlertChannel {
    const url = this.crypto.tryDecrypt(row.urlEnc);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as AlertChannelKind,
      urlPreview: url ? previewUrl(url) : 'unreadable',
      enabled: row.enabled,
      triggers: row.triggers as AlertTrigger[],
      lastDeliveryAt: row.lastDeliveryAt ? toIsoStrict(row.lastDeliveryAt) : null,
      lastError: row.lastError,
      createdAt: toIsoStrict(row.createdAt),
      updatedAt: toIsoStrict(row.updatedAt),
    };
  }

  private record(id: string, delivery: AlertDelivery): AlertDelivery {
    this.db
      .update(alertChannels)
      .set({
        lastDeliveryAt: nowMs(),
        lastError: delivery.ok ? null : delivery.message,
        updatedAt: nowMs(),
      })
      .where(eq(alertChannels.id, id))
      .run();
    if (!delivery.ok) this.log.warn(`Alert delivery failed: ${delivery.message}`);
    return delivery;
  }
}

/**
 * Slack and Discord both accept a JSON body with a text field, under different names. A plain
 * `webhook` gets the documented payload so people can parse it in n8n, ntfy or their own service.
 */
export function bodyFor(kind: AlertChannelKind, payload: AlertPayload): unknown {
  const icon = payload.severity === 'critical' ? '🔴' : '🟢';
  const line = `${icon} puente — ${payload.text}`;
  if (kind === 'slack') return { text: line };
  if (kind === 'discord') return { content: line };
  return payload;
}

/**
 * Host plus a truncated path. Slack and Discord webhook URLs are bearer credentials in disguise:
 * once stored, the API must never hand one back, not even to the admin who typed it.
 */
export function previewUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : `${parsed.pathname.slice(0, 12)}…`;
    return `${parsed.host}${path}`;
  } catch {
    return 'invalid url';
  }
}
