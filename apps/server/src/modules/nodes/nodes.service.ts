import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  CreateNodeInput,
  Node,
  ProvisionNodeInput,
  SshBootstrapInput,
  SshTestResult,
  UpdateNodeInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { EventBus } from '../../common/event-bus.service';
import { EventsService } from '../events/events.service';
import { SshService } from '../ssh/ssh.service';
import { CloudflaredService, type Target } from '../cloudflared/cloudflared.service';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import { SettingsService } from '../settings/settings.service';
import { RoutesService } from '../routes/routes.service';
import { nodes, type NodeRow } from '../../db/schema';
import { newId } from '../../common/ids';
import { nowMs } from '../../common/time';
import { toNodeDto } from './node.mapper';
import type { CommandExecutor } from '../../common/executor';

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
    private readonly bus: EventBus,
    private readonly events: EventsService,
    private readonly ssh: SshService,
    private readonly cloudflared: CloudflaredService,
    private readonly cloudflare: CloudflareService,
    private readonly settings: SettingsService,
    private readonly routes: RoutesService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  list(): Node[] {
    return this.db.select().from(nodes).all().map(toNodeDto);
  }

  getRow(id: string): NodeRow {
    const row = this.db.select().from(nodes).where(eq(nodes.id, id)).get();
    if (!row) throw new NotFoundException(`Node ${id} not found`);
    return row;
  }

  get(id: string): Node {
    return toNodeDto(this.getRow(id));
  }

  async create(dto: CreateNodeInput): Promise<Node> {
    const now = nowMs();
    const base = {
      id: newId('node'),
      name: dto.name,
      provisionState: 'unprovisioned' as const,
      connectorRunState: 'unknown' as const,
      serviceInstalled: false,
      createdAt: now,
      updatedAt: now,
    };

    if (dto.kind === 'local') {
      // Only one local node makes sense (the control-plane host).
      const existingLocal = this.db.select().from(nodes).where(eq(nodes.kind, 'local')).get();
      if (existingLocal) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'LocalExists',
          message: 'A local node already exists.',
          code: 'LOCAL_EXISTS',
        });
      }
      this.db
        .insert(nodes)
        .values({ ...base, kind: 'local' })
        .run();
    } else {
      let host = dto.host;
      let port = dto.port;
      let username = dto.username;
      let privateKeyPath = dto.privateKeyPath ?? null;

      if (dto.sshConfigAlias) {
        const hosts = await this.ssh.parseUserSshConfig();
        const alias = hosts.find((h) => h.alias === dto.sshConfigAlias);
        if (alias) {
          host = alias.hostName ?? host;
          username = alias.user ?? username;
          port = alias.port ?? port;
          privateKeyPath = privateKeyPath ?? alias.identityFile;
        }
      }

      this.db
        .insert(nodes)
        .values({
          ...base,
          kind: 'ssh',
          sshHost: host,
          sshPort: port,
          sshUsername: username,
          sshAuthMethod: 'key',
          sshPrivateKeyPath: privateKeyPath,
          sshManagedKey: false,
        })
        .run();
    }

    this.events.info('node.create', `Added node "${dto.name}"`, { nodeId: base.id });
    return this.emitUpdated(base.id);
  }

  update(id: string, dto: UpdateNodeInput): Node {
    const row = this.getRow(id);
    const patch: Partial<NodeRow> = { updatedAt: nowMs() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (row.kind === 'ssh') {
      if (dto.host !== undefined) patch.sshHost = dto.host;
      if (dto.port !== undefined) patch.sshPort = dto.port;
      if (dto.username !== undefined) patch.sshUsername = dto.username;
      if (dto.privateKeyPath !== undefined) patch.sshPrivateKeyPath = dto.privateKeyPath;
    }
    this.db.update(nodes).set(patch).where(eq(nodes.id, id)).run();
    return this.emitUpdated(id);
  }

  async remove(id: string): Promise<void> {
    const row = this.getRow(id);
    // Best-effort teardown of the connector + tunnel.
    try {
      await this.withTarget(row, async (target) => {
        await this.cloudflared.uninstallConnector(target);
      });
    } catch (err) {
      this.logger.warn(`Connector teardown failed for ${row.name}: ${String(err)}`);
    }
    await this.routes.removeForNode(id).catch((e) => this.logger.warn(String(e)));
    if (row.tunnelId) {
      await this.cloudflare
        .deleteTunnel(row.tunnelId)
        .catch((e) => this.logger.warn(`Tunnel delete failed: ${String(e)}`));
    }
    this.db.delete(nodes).where(eq(nodes.id, id)).run();
    this.events.info('node.delete', `Removed node "${row.name}"`, { nodeId: id });
    this.bus.emit({ type: 'node.deleted', nodeId: id });
  }

  // --- SSH lifecycle --------------------------------------------------------

  async test(id: string): Promise<SshTestResult> {
    const row = this.getRow(id);
    if (row.kind === 'local') {
      const exec = await this.ssh.getExecutor(row);
      try {
        const d = await this.ssh.detect(exec);
        this.applyFacts(id, d);
        return {
          ok: true,
          reachable: true,
          authenticated: true,
          os: d.os,
          arch: d.arch,
          hostname: d.hostname,
          passwordlessSudo: d.passwordlessSudo,
          cloudflaredVersion: d.cloudflaredVersion,
          hostKeyFingerprint: null,
          message: 'Local machine reachable.',
        };
      } finally {
        await exec.dispose();
      }
    }
    const result = await this.ssh.test({
      host: row.sshHost!,
      port: row.sshPort ?? 22,
      username: row.sshUsername!,
      privateKeyPath: row.sshPrivateKeyPath,
      expectedFingerprint: row.sshHostKeyFingerprint,
    });
    if (result.ok) {
      this.applyFacts(id, result);
      if (result.hostKeyFingerprint && !row.sshHostKeyFingerprint) {
        this.db
          .update(nodes)
          .set({ sshHostKeyFingerprint: result.hostKeyFingerprint, updatedAt: nowMs() })
          .where(eq(nodes.id, id))
          .run();
      }
    }
    this.emitUpdated(id);
    return result;
  }

  async bootstrap(id: string, dto: SshBootstrapInput): Promise<SshTestResult> {
    const row = this.getRow(id);
    if (row.kind !== 'ssh') {
      throw new BadRequestException('Only SSH nodes can be bootstrapped.');
    }
    const { privateKeyPath, fingerprint } = await this.ssh.bootstrapPasswordless({
      host: row.sshHost!,
      port: row.sshPort ?? 22,
      username: row.sshUsername!,
      password: dto.password,
      keyName: `${row.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-${row.id.slice(-6)}`,
    });
    this.db
      .update(nodes)
      .set({
        sshPrivateKeyPath: privateKeyPath,
        sshManagedKey: true,
        sshHostKeyFingerprint: fingerprint,
        sshAuthMethod: 'key',
        updatedAt: nowMs(),
      })
      .where(eq(nodes.id, id))
      .run();
    this.events.success('node.bootstrap', `Passwordless SSH configured for "${row.name}"`, {
      nodeId: id,
    });
    this.emitUpdated(id);
    return this.test(id);
  }

  // --- Provisioning ---------------------------------------------------------

  async provision(id: string, dto: ProvisionNodeInput): Promise<Node> {
    const row = this.getRow(id);
    if (!this.settings.isCloudflareConnected()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CloudflareNotConnected',
        message: 'Connect Cloudflare before provisioning nodes.',
        code: 'CF_NOT_CONNECTED',
      });
    }
    const scope = `node:${id}`;
    this.setState(id, { provisionState: 'provisioning', lastError: null });
    this.emitUpdated(id);
    this.bus.progress(scope, 'connect', `Connecting to ${row.name}…`);

    const exec = await this.ssh.getExecutor(row);
    try {
      const detect = await this.ssh.detect(exec);
      this.applyFacts(id, detect);
      const target: Target = {
        exec,
        os: detect.os,
        arch: detect.arch,
        passwordlessSudo: detect.passwordlessSudo,
      };

      this.bus.progress(scope, 'cloudflared', 'Ensuring cloudflared is installed…');
      const inst = await this.cloudflared.ensureInstalled(target, detect.cloudflaredVersion);
      if (inst.version) this.setState(id, { cloudflaredVersion: inst.version });

      let tunnelId = dto.existingTunnelId ?? row.tunnelId;
      let tunnelName = row.tunnelName;
      if (!tunnelId) {
        this.bus.progress(scope, 'tunnel', 'Creating Cloudflare tunnel…');
        const t = await this.cloudflare.createTunnel(this.tunnelNameFor(row));
        tunnelId = t.id;
        tunnelName = t.name;
      }

      this.bus.progress(scope, 'token', 'Fetching connector token…');
      const token = await this.cloudflare.getTunnelToken(tunnelId);
      this.setState(id, {
        tunnelId,
        tunnelName,
        tunnelTokenEnc: this.crypto.encrypt(token),
      });

      this.bus.progress(scope, 'ingress', 'Applying ingress configuration…');
      await this.routes.rebuildIngress(id);

      this.bus.progress(
        scope,
        'service',
        dto.installService ? 'Installing connector service…' : 'Starting connector…',
      );
      const conn = await this.cloudflared.installConnector(target, token);
      if (conn.note) this.events.warn('node.provision', conn.note, { nodeId: id });

      this.setState(id, {
        serviceInstalled: conn.serviceInstalled,
        provisionState: 'provisioned',
        connectorRunState: 'running',
        lastSeenAt: nowMs(),
        lastError: null,
      });
      this.events.success('node.provision', `Node "${row.name}" is live`, { nodeId: id });
      this.bus.progress(scope, 'done', 'Node ready', { done: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState(id, { provisionState: 'error', lastError: msg });
      this.events.error('node.provision', `Provisioning "${row.name}" failed: ${msg}`, {
        nodeId: id,
      });
      this.bus.progress(scope, 'error', msg, { done: true, error: true });
      this.emitUpdated(id);
      throw err instanceof BadRequestException ? err : new BadRequestException(msg);
    } finally {
      await exec.dispose();
    }
    // Refresh live tunnel status post-provision.
    await this.refreshStatus(id).catch(() => undefined);
    return this.emitUpdated(id);
  }

  async setConnector(id: string, action: 'start' | 'stop' | 'restart'): Promise<Node> {
    const row = this.getRow(id);
    await this.withTarget(row, async (target) => {
      if (action === 'start' && !row.serviceInstalled && row.tunnelId) {
        // No persistent service: (re)launch detached using the stored token.
        const token = this.crypto.tryDecrypt(row.tunnelTokenEnc);
        if (token) {
          await this.cloudflared.installConnector(target, token);
          return;
        }
      }
      await this.cloudflared.controlService(target, action);
    });
    this.events.info('node.connector', `Connector ${action} on "${row.name}"`, { nodeId: id });
    return this.refreshStatus(id);
  }

  async refreshStatus(id: string): Promise<Node> {
    const row = this.getRow(id);
    // Live tunnel status from Cloudflare (no SSH needed).
    if (row.tunnelId && this.settings.isCloudflareConnected()) {
      try {
        const info = await this.cloudflare.getTunnelInfo(row.tunnelId);
        if (info) {
          this.setState(id, {
            tunnelStatus: info.status,
            connectionCount: info.connectionCount,
          });
        }
      } catch (err) {
        this.logger.warn(`tunnel status refresh failed: ${String(err)}`);
      }
    }
    // Connector run state (best-effort; remote may be offline).
    try {
      await this.withTarget(row, async (target) => {
        const state = await this.cloudflared.runState(target);
        this.setState(id, { connectorRunState: state, lastSeenAt: nowMs() });
      });
    } catch (err) {
      this.setState(id, { connectorRunState: 'unknown' });
      this.logger.debug(`run state check failed for ${row.name}: ${String(err)}`);
    }
    return this.emitUpdated(id);
  }

  /** Lightweight, SSH-free refresh of tunnel status for all provisioned nodes. */
  async pollTunnelStatuses(): Promise<void> {
    if (!this.settings.isCloudflareConnected()) return;
    const provisioned = this.db
      .select()
      .from(nodes)
      .all()
      .filter((n) => n.tunnelId);
    for (const n of provisioned) {
      try {
        const info = await this.cloudflare.getTunnelInfo(n.tunnelId!);
        if (!info) continue;
        if (n.tunnelStatus !== info.status || n.connectionCount !== info.connectionCount) {
          this.setState(n.id, {
            tunnelStatus: info.status,
            connectionCount: info.connectionCount,
          });
          this.emitUpdated(n.id);
        }
      } catch {
        /* transient; try again next tick */
      }
    }
  }

  // --- helpers --------------------------------------------------------------

  private async withTarget<T>(
    row: NodeRow,
    fn: (target: Target, exec: CommandExecutor) => Promise<T>,
  ): Promise<T> {
    const exec = await this.ssh.getExecutor(row);
    try {
      const detect = await this.ssh.detect(exec);
      const target: Target = {
        exec,
        os: detect.os,
        arch: detect.arch,
        passwordlessSudo: detect.passwordlessSudo,
      };
      return await fn(target, exec);
    } finally {
      await exec.dispose();
    }
  }

  private applyFacts(
    id: string,
    facts: { os: string | null; arch: string | null; cloudflaredVersion: string | null },
  ): void {
    this.setState(id, {
      os: facts.os,
      arch: facts.arch,
      cloudflaredVersion: facts.cloudflaredVersion,
      lastSeenAt: nowMs(),
    });
  }

  private setState(id: string, patch: Partial<NodeRow>): void {
    this.db
      .update(nodes)
      .set({ ...patch, updatedAt: nowMs() })
      .where(eq(nodes.id, id))
      .run();
  }

  private emitUpdated(id: string): Node {
    const dto = this.get(id);
    this.bus.emit({ type: 'node.updated', node: dto });
    return dto;
  }

  private tunnelNameFor(row: NodeRow): string {
    const slug = row.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `puente-${slug || 'node'}-${row.id.slice(-6)}`;
  }
}
