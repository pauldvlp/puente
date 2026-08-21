import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { ServiceTarget, OriginRequestOptions } from '@puente/shared';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * App-wide preferences. The Cloudflare connection used to live here; it moved to `workspaces`
 * so several accounts can sit side by side — see db/migrations.ts.
 */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(), // always 'app'
  healthPollSeconds: integer('health_poll_seconds').notNull().default(30),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** One Cloudflare account and everything published through it. */
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cloudflareAuthMode: text('cloudflare_auth_mode'),
  cloudflareApiTokenEnc: text('cloudflare_api_token_enc'),
  cloudflareAccountId: text('cloudflare_account_id'),
  cloudflareAccountName: text('cloudflare_account_name'),
  defaultZoneId: text('default_zone_id'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const zones = sqliteTable('zones', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  name: text('name').notNull(),
  status: text('status'),
  accountId: text('account_id'),
  updatedAt: integer('updated_at').notNull(),
});

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'local' | 'ssh'
  sshHost: text('ssh_host'),
  sshPort: integer('ssh_port'),
  sshUsername: text('ssh_username'),
  sshAuthMethod: text('ssh_auth_method'),
  sshPrivateKeyPath: text('ssh_private_key_path'),
  sshManagedKey: integer('ssh_managed_key', { mode: 'boolean' }),
  sshHostKeyFingerprint: text('ssh_host_key_fingerprint'),
  tunnelId: text('tunnel_id'),
  tunnelName: text('tunnel_name'),
  tunnelTokenEnc: text('tunnel_token_enc'),
  provisionState: text('provision_state').notNull().default('unprovisioned'),
  connectorRunState: text('connector_run_state').notNull().default('unknown'),
  tunnelStatus: text('tunnel_status'),
  serviceInstalled: integer('service_installed', { mode: 'boolean' }).notNull().default(false),
  os: text('os'),
  arch: text('arch'),
  cloudflaredVersion: text('cloudflared_version'),
  connectionCount: integer('connection_count'),
  lastError: text('last_error'),
  lastSeenAt: integer('last_seen_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const routes = sqliteTable('routes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  nodeId: text('node_id').notNull(),
  hostname: text('hostname').notNull(),
  subdomain: text('subdomain').notNull(),
  zoneId: text('zone_id').notNull(),
  zoneName: text('zone_name').notNull(),
  service: text('service', { mode: 'json' }).notNull().$type<ServiceTarget>(),
  path: text('path'),
  originRequest: text('origin_request', { mode: 'json' }).$type<OriginRequestOptions>(),
  dnsRecordId: text('dns_record_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('pending'),
  health: text('health').notNull().default('unknown'),
  lastCheckedAt: integer('last_checked_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull(),
  level: text('level').notNull(),
  action: text('action').notNull(),
  message: text('message').notNull(),
  nodeId: text('node_id'),
  routeId: text('route_id'),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
});

export const license = sqliteTable('license', {
  id: text('id').primaryKey(), // always 'current'
  key: text('key').notNull(),
  licenseId: text('license_id').notNull(),
  activatedAt: integer('activated_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const alertChannels = sqliteTable('alert_channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // 'webhook' | 'slack' | 'discord'
  /** The destination URL *is* the credential for Slack and Discord, so it is encrypted at rest. */
  urlEnc: text('url_enc').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  triggers: text('triggers', { mode: 'json' }).notNull().$type<string[]>(),
  /** subject id -> epoch millis of the last alert sent about it, for the cooldown. */
  cooldown: text('cooldown', { mode: 'json' }).$type<Record<string, number>>(),
  lastDeliveryAt: integer('last_delivery_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SettingsRow = typeof settings.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type ZoneRow = typeof zones.$inferSelect;
export type NodeRow = typeof nodes.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type LicenseRow = typeof license.$inferSelect;
export type AlertChannelRow = typeof alertChannels.$inferSelect;
