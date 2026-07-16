import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  buildServiceUrl,
  computeHostname,
  type CreateRouteInput,
  type Route,
  type RouteCheckResult,
  type RouteHealth,
  type UpdateRouteInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { EventBus } from '../../common/event-bus.service';
import { EventsService } from '../events/events.service';
import { CloudflareService, type IngressRule } from '../cloudflare/cloudflare.service';
import { SettingsService } from '../settings/settings.service';
import { nodes, routes, type NodeRow, type RouteRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs, toIso, toIsoStrict } from '../../common/time';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly cloudflare: CloudflareService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
    private readonly bus: EventBus,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  list(): Route[] {
    return this.db.select().from(routes).all().map((r) => this.toDto(r));
  }

  listForNode(nodeId: string): Route[] {
    return this.db
      .select()
      .from(routes)
      .where(eq(routes.nodeId, nodeId))
      .all()
      .map((r) => this.toDto(r));
  }

  getRow(id: string): RouteRow {
    const row = this.db.select().from(routes).where(eq(routes.id, id)).get();
    if (!row) throw new NotFoundException(`Route ${id} not found`);
    return row;
  }

  get(id: string): Route {
    return this.toDto(this.getRow(id));
  }

  private nodeRow(nodeId: string): NodeRow {
    const node = this.db.select().from(nodes).where(eq(nodes.id, nodeId)).get();
    if (!node) throw new NotFoundException(`Node ${nodeId} not found`);
    return node;
  }

  async create(dto: CreateRouteInput): Promise<Route> {
    const node = this.nodeRow(dto.nodeId);
    if (!node.tunnelId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'NodeNotProvisioned',
        message: `Provision node "${node.name}" before adding routes.`,
        code: 'NODE_NOT_PROVISIONED',
      });
    }
    const zone = this.settings.getZone(dto.zoneId);
    if (!zone) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'UnknownZone',
        message: 'Unknown zone. Refresh your Cloudflare zones.',
        code: 'UNKNOWN_ZONE',
      });
    }
    const hostname = computeHostname(dto.subdomain, zone.name);
    const existing = this.db.select().from(routes).where(eq(routes.hostname, hostname)).get();
    if (existing) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'HostnameTaken',
        message: `${hostname} is already routed.`,
        code: 'HOSTNAME_TAKEN',
      });
    }

    const now = nowMs();
    const row: RouteRow = {
      id: newId('route'),
      nodeId: dto.nodeId,
      hostname,
      subdomain: dto.subdomain,
      zoneId: dto.zoneId,
      zoneName: zone.name,
      service: dto.service,
      path: dto.path ?? null,
      originRequest: dto.originRequest ?? null,
      dnsRecordId: null,
      enabled: dto.enabled,
      status: 'pending',
      health: 'unknown',
      lastCheckedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(routes).values(row).run();

    try {
      await this.rebuildIngress(dto.nodeId);
      const { recordId } = await this.cloudflare.upsertTunnelCname(
        dto.zoneId,
        hostname,
        node.tunnelId,
      );
      this.patch(row.id, { dnsRecordId: recordId, status: dto.enabled ? 'active' : 'disabled', lastError: null });
      this.events.success('route.create', `Published ${hostname} → ${buildServiceUrl(dto.service)}`, {
        nodeId: dto.nodeId,
        routeId: row.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.patch(row.id, { status: 'error', lastError: msg });
      this.events.error('route.create', `Failed to publish ${hostname}: ${msg}`, {
        nodeId: dto.nodeId,
        routeId: row.id,
      });
      throw err;
    }
    return this.emitUpdated(row.id);
  }

  async update(id: string, dto: UpdateRouteInput): Promise<Route> {
    const row = this.getRow(id);
    const patch: Partial<RouteRow> = { updatedAt: nowMs() };
    if (dto.service !== undefined) patch.service = dto.service;
    if (dto.path !== undefined) patch.path = dto.path;
    if (dto.originRequest !== undefined) patch.originRequest = dto.originRequest;
    if (dto.enabled !== undefined) {
      patch.enabled = dto.enabled;
      patch.status = dto.enabled ? 'active' : 'disabled';
    }
    this.patch(id, patch);
    await this.rebuildIngress(row.nodeId);
    this.events.info('route.update', `Updated route ${row.hostname}`, {
      nodeId: row.nodeId,
      routeId: id,
    });
    return this.emitUpdated(id);
  }

  async remove(id: string): Promise<void> {
    const row = this.getRow(id);
    if (row.dnsRecordId) {
      await this.cloudflare.deleteDnsRecord(row.zoneId, row.dnsRecordId).catch((e) =>
        this.logger.warn(`DNS delete failed for ${row.hostname}: ${String(e)}`),
      );
    }
    this.db.delete(routes).where(eq(routes.id, id)).run();
    const node = this.db.select().from(nodes).where(eq(nodes.id, row.nodeId)).get();
    if (node?.tunnelId) {
      await this.rebuildIngress(row.nodeId).catch((e) =>
        this.logger.warn(`Ingress rebuild after delete failed: ${String(e)}`),
      );
    }
    this.events.info('route.delete', `Removed route ${row.hostname}`, { nodeId: row.nodeId, routeId: id });
    this.bus.emit({ type: 'route.deleted', routeId: id });
  }

  /** Delete all routes for a node (used when deprovisioning/deleting a node). */
  async removeForNode(nodeId: string): Promise<void> {
    const rows = this.db.select().from(routes).where(eq(routes.nodeId, nodeId)).all();
    for (const r of rows) {
      if (r.dnsRecordId) {
        await this.cloudflare.deleteDnsRecord(r.zoneId, r.dnsRecordId).catch(() => undefined);
      }
    }
    this.db.delete(routes).where(eq(routes.nodeId, nodeId)).run();
  }

  /**
   * Read-modify-write the whole ingress list for a node's tunnel (Cloudflare
   * requires the full ordered array; the 404 catch-all is appended by the SDK
   * wrapper).
   */
  async rebuildIngress(nodeId: string): Promise<void> {
    const node = this.nodeRow(nodeId);
    if (!node.tunnelId) return;
    const rows = this.db
      .select()
      .from(routes)
      .where(and(eq(routes.nodeId, nodeId), eq(routes.enabled, true)))
      .all();

    const rules: IngressRule[] = rows
      // more specific rules (with a path) first
      .sort((a, b) => Number(Boolean(b.path)) - Number(Boolean(a.path)))
      .map((r) => {
        const rule: IngressRule = {
          hostname: r.hostname,
          service: buildServiceUrl(r.service),
        };
        if (r.path) rule.path = r.path;
        if (r.originRequest && Object.keys(r.originRequest).length > 0) {
          rule.originRequest = r.originRequest as Record<string, unknown>;
        }
        return rule;
      });

    await this.cloudflare.putIngress(node.tunnelId, rules);
  }

  /** Probe the public hostname to gauge whether the origin is reachable. */
  async check(id: string): Promise<RouteCheckResult> {
    const row = this.getRow(id);
    // The public hostname is always fronted by Cloudflare over HTTPS,
    // regardless of the origin protocol.
    let health: RouteHealth = 'unknown';
    let httpStatus: number | null = null;
    let message = '';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`https://${row.hostname}`, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timer);
      httpStatus = res.status;
      // 502/503/504 from the edge means the tunnel/origin is down.
      health = res.status >= 502 && res.status <= 504 ? 'unhealthy' : 'healthy';
      message = `HTTP ${res.status}`;
    } catch (err) {
      health = 'unhealthy';
      message = err instanceof Error ? err.message : String(err);
    }
    const checkedAt = nowMs();
    this.patch(id, { health, lastCheckedAt: checkedAt, lastError: health === 'healthy' ? null : message });
    this.emitUpdated(id);
    return { health, httpStatus, message, checkedAt: toIsoStrict(checkedAt) };
  }

  private patch(id: string, patch: Partial<RouteRow>): void {
    this.db.update(routes).set({ ...patch, updatedAt: nowMs() }).where(eq(routes.id, id)).run();
  }

  private emitUpdated(id: string): Route {
    const dto = this.get(id);
    this.bus.emit({ type: 'route.updated', route: dto });
    return dto;
  }

  private toDto(r: RouteRow): Route {
    return {
      id: r.id,
      nodeId: r.nodeId,
      hostname: r.hostname,
      subdomain: r.subdomain,
      zoneId: r.zoneId,
      zoneName: r.zoneName,
      service: r.service,
      path: r.path,
      originRequest: r.originRequest ?? null,
      dnsRecordId: r.dnsRecordId,
      enabled: Boolean(r.enabled),
      status: r.status as Route['status'],
      health: r.health as RouteHealth,
      lastCheckedAt: toIso(r.lastCheckedAt),
      lastError: r.lastError,
      createdAt: toIsoStrict(r.createdAt),
      updatedAt: toIsoStrict(r.updatedAt),
    };
  }
}
