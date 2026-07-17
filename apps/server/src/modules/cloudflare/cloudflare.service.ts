import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import Cloudflare from 'cloudflare';
import type {
  CloudflareAccount,
  CloudflareConnection,
  CloudflareZone,
  TunnelStatus,
} from '@puente/shared';
import { SettingsService } from '../settings/settings.service';

export interface IngressRule {
  hostname?: string;
  service: string;
  path?: string;
  originRequest?: Record<string, unknown>;
}

export interface TunnelInfo {
  id: string;
  name: string;
  status: TunnelStatus;
  connectionCount: number;
}

/**
 * Thin, typed wrapper around the official `cloudflare` SDK covering exactly what
 * puente needs: token verification, account/zone discovery, remotely-managed
 * tunnel lifecycle, ingress configuration, and proxied CNAME routing.
 */
@Injectable()
export class CloudflareService {
  private readonly logger = new Logger(CloudflareService.name);

  constructor(private readonly settings: SettingsService) {}

  private clientFor(token: string): Cloudflare {
    return new Cloudflare({ apiToken: token });
  }

  /** Build a client from stored credentials, or throw if not connected. */
  private client(): { cf: Cloudflare; accountId: string } {
    const token = this.settings.getCloudflareToken();
    const accountId = this.settings.getAccountId();
    if (!token || !accountId) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CloudflareNotConnected',
        message: 'Cloudflare is not connected. Add an API token first.',
        code: 'CF_NOT_CONNECTED',
      });
    }
    return { cf: this.clientFor(token), accountId };
  }

  private wrap(err: unknown, context: string): never {
    const anyErr = err as {
      status?: number;
      message?: string;
      errors?: Array<{ message: string }>;
    };
    const detail =
      anyErr?.errors?.map((e) => e.message).join('; ') || anyErr?.message || String(err);
    this.logger.warn(`Cloudflare error (${context}): ${detail}`);
    if (anyErr?.status === 403 || anyErr?.status === 401) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CloudflarePermission',
        message: `Cloudflare rejected the request (${context}): ${detail}. Check that your API token has the required scopes.`,
        code: 'CF_PERMISSION',
      });
    }
    throw new InternalServerErrorException({
      statusCode: 500,
      error: 'CloudflareError',
      message: `Cloudflare error (${context}): ${detail}`,
      code: 'CF_ERROR',
    });
  }

  // --- Auth / discovery -----------------------------------------------------

  /** Verify a token and enumerate the accounts + zones it can access. */
  async verifyToken(token: string): Promise<{
    status: 'active' | 'disabled' | 'expired' | 'unknown';
    accounts: CloudflareAccount[];
    zones: CloudflareZone[];
  }> {
    const cf = this.clientFor(token);
    let status: 'active' | 'disabled' | 'expired' | 'unknown' = 'unknown';
    try {
      const verify = await cf.user.tokens.verify();
      status = (verify?.status as typeof status) ?? 'unknown';
    } catch (err) {
      this.wrap(err, 'verify token');
    }
    const accounts: CloudflareAccount[] = [];
    const zones: CloudflareZone[] = [];
    try {
      for await (const a of cf.accounts.list()) {
        accounts.push({ id: a.id, name: a.name, type: (a as { type?: string }).type });
      }
    } catch (err) {
      this.wrap(err, 'list accounts');
    }
    try {
      for await (const z of cf.zones.list()) {
        zones.push({
          id: z.id,
          name: z.name,
          status: (z as { status?: string }).status,
          accountId: (z as { account?: { id?: string } }).account?.id,
        });
      }
    } catch (err) {
      this.wrap(err, 'list zones');
    }
    return { status, accounts, zones };
  }

  /** Connect + persist credentials, caching zones for the chosen account. */
  async connect(token: string, preferredAccountId?: string): Promise<CloudflareConnection> {
    const { status, accounts, zones } = await this.verifyToken(token);
    if (status === 'expired' || status === 'disabled') {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CloudflareToken',
        message: `The API token is ${status}. Create a new token.`,
        code: 'CF_TOKEN_INVALID',
      });
    }
    if (accounts.length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'CloudflareToken',
        message:
          'The token is valid but no accounts are visible. Add the "Account Settings: Read" permission.',
        code: 'CF_NO_ACCOUNTS',
      });
    }
    const account = accounts.find((a) => a.id === preferredAccountId) ?? accounts[0];
    const accountZones = zones.filter((z) => !z.accountId || z.accountId === account.id);
    this.settings.setCloudflareToken(token, account.id, account.name);
    this.settings.saveZones(accountZones.length ? accountZones : zones);
    return {
      connected: true,
      authMode: 'token',
      tokenStatus: status,
      account,
      accounts,
      zones: this.settings.getZones(),
    };
  }

  /** Current connection state assembled from cached settings (no live call). */
  getConnection(): CloudflareConnection {
    const row = this.settings.get();
    const connected = this.settings.isCloudflareConnected();
    const account: CloudflareAccount | null = row.cloudflareAccountId
      ? { id: row.cloudflareAccountId, name: row.cloudflareAccountName ?? row.cloudflareAccountId }
      : null;
    return {
      connected,
      authMode: (row.cloudflareAuthMode as CloudflareConnection['authMode']) ?? null,
      tokenStatus: connected ? 'active' : null,
      account,
      accounts: account ? [account] : [],
      zones: this.settings.getZones(),
    };
  }

  /** Re-fetch and cache zones for the connected account. */
  async refreshZones(): Promise<CloudflareZone[]> {
    const token = this.settings.getCloudflareToken();
    const accountId = this.settings.getAccountId();
    if (!token) return [];
    const zones: CloudflareZone[] = [];
    const cf = this.clientFor(token);
    try {
      for await (const z of cf.zones.list()) {
        const zAccount = (z as { account?: { id?: string } }).account?.id;
        if (accountId && zAccount && zAccount !== accountId) continue;
        zones.push({
          id: z.id,
          name: z.name,
          status: (z as { status?: string }).status,
          accountId: zAccount,
        });
      }
    } catch (err) {
      this.wrap(err, 'refresh zones');
    }
    this.settings.saveZones(zones);
    return zones;
  }

  // --- Tunnels --------------------------------------------------------------

  async createTunnel(name: string): Promise<{ id: string; name: string }> {
    const { cf, accountId } = this.client();
    try {
      const tunnel = await cf.zeroTrust.tunnels.cloudflared.create({
        account_id: accountId,
        name,
        config_src: 'cloudflare',
      });
      return { id: tunnel.id as string, name: (tunnel.name as string) ?? name };
    } catch (err) {
      this.wrap(err, 'create tunnel');
    }
  }

  async deleteTunnel(tunnelId: string): Promise<void> {
    const { cf, accountId } = this.client();
    try {
      await cf.zeroTrust.tunnels.cloudflared.delete(tunnelId, { account_id: accountId });
    } catch (err) {
      this.wrap(err, 'delete tunnel');
    }
  }

  /** Retrieve the opaque run token used by `cloudflared tunnel run --token`. */
  async getTunnelToken(tunnelId: string): Promise<string> {
    const { cf, accountId } = this.client();
    try {
      const token = await cf.zeroTrust.tunnels.cloudflared.token.get(tunnelId, {
        account_id: accountId,
      });
      return token as unknown as string;
    } catch (err) {
      this.wrap(err, 'get tunnel token');
    }
  }

  async getTunnelInfo(tunnelId: string): Promise<TunnelInfo | null> {
    const { cf, accountId } = this.client();
    try {
      const t = await cf.zeroTrust.tunnels.cloudflared.get(tunnelId, { account_id: accountId });
      let connectionCount = 0;
      try {
        for await (const client of cf.zeroTrust.tunnels.cloudflared.connections.get(tunnelId, {
          account_id: accountId,
        })) {
          const conns = (client as { conns?: unknown[] }).conns;
          connectionCount += Array.isArray(conns) ? conns.length : 0;
        }
      } catch {
        /* connections listing is best-effort */
      }
      return {
        id: t.id as string,
        name: (t.name as string) ?? '',
        status: ((t as { status?: string }).status as TunnelStatus) ?? 'inactive',
        connectionCount,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) return null;
      this.wrap(err, 'get tunnel');
    }
  }

  async listTunnels(): Promise<TunnelInfo[]> {
    const { cf, accountId } = this.client();
    const out: TunnelInfo[] = [];
    try {
      for await (const t of cf.zeroTrust.tunnels.cloudflared.list({ account_id: accountId })) {
        if ((t as { deleted_at?: string }).deleted_at) continue;
        out.push({
          id: t.id as string,
          name: (t.name as string) ?? '',
          status: ((t as { status?: string }).status as TunnelStatus) ?? 'inactive',
          connectionCount: 0,
        });
      }
    } catch (err) {
      this.wrap(err, 'list tunnels');
    }
    return out;
  }

  // --- Ingress configuration -----------------------------------------------

  /** Overwrite the tunnel's ingress rules (catch-all appended automatically). */
  async putIngress(tunnelId: string, rules: IngressRule[]): Promise<void> {
    const { cf, accountId } = this.client();
    const ingress: IngressRule[] = [...rules, { service: 'http_status:404' }];
    try {
      await cf.zeroTrust.tunnels.cloudflared.configurations.update(tunnelId, {
        account_id: accountId,
        config: { ingress: ingress as never },
      });
    } catch (err) {
      this.wrap(err, 'update tunnel configuration');
    }
  }

  // --- DNS routing ----------------------------------------------------------

  /** Create or update the proxied CNAME hostname → {tunnelId}.cfargotunnel.com. */
  async upsertTunnelCname(
    zoneId: string,
    hostname: string,
    tunnelId: string,
  ): Promise<{ recordId: string }> {
    const { cf } = this.client();
    const content = `${tunnelId}.cfargotunnel.com`;
    try {
      let found: { id: string } | undefined;
      for await (const rec of cf.dns.records.list({
        zone_id: zoneId,
        type: 'CNAME',
        name: { exact: hostname } as never,
      })) {
        found = rec as { id: string };
        break;
      }
      if (found) {
        await cf.dns.records.edit(found.id, {
          zone_id: zoneId,
          type: 'CNAME',
          name: hostname,
          content,
          proxied: true,
          ttl: 1,
        } as never);
        return { recordId: found.id };
      }
      const created = await cf.dns.records.create({
        zone_id: zoneId,
        type: 'CNAME',
        name: hostname,
        content,
        proxied: true,
        ttl: 1,
        comment: 'Managed by puente',
      } as never);
      return { recordId: (created as { id: string }).id };
    } catch (err) {
      this.wrap(err, 'upsert DNS record');
    }
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    const { cf } = this.client();
    try {
      await cf.dns.records.delete(recordId, { zone_id: zoneId });
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) return; // already gone
      this.wrap(err, 'delete DNS record');
    }
  }
}
