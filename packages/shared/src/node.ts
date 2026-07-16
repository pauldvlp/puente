import { z } from 'zod';
import { SshConfigSchema, SshTestResultSchema } from './ssh.js';
import { TunnelStatusSchema } from './cloudflare.js';

/** A node is a machine (this PC, or a remote host) that runs a cloudflared connector. */
export const NodeKindSchema = z.enum(['local', 'ssh']);
export type NodeKind = z.infer<typeof NodeKindSchema>;

/** Lifecycle of the connector provisioning on a node. */
export const ProvisionStateSchema = z.enum([
  'unprovisioned', // no tunnel/connector yet
  'provisioning', // install/create in progress
  'provisioned', // tunnel created + connector service installed
  'error',
]);
export type ProvisionState = z.infer<typeof ProvisionStateSchema>;

/** Whether the cloudflared service is installed & running on the node. */
export const ConnectorRunStateSchema = z.enum(['unknown', 'stopped', 'running', 'error']);
export type ConnectorRunState = z.infer<typeof ConnectorRunStateSchema>;

export const NodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: NodeKindSchema,
  ssh: SshConfigSchema.nullable(),
  // Cloudflare tunnel bound to this node (remotely-managed).
  tunnelId: z.string().nullable(),
  tunnelName: z.string().nullable(),
  // State
  provisionState: ProvisionStateSchema,
  connectorRunState: ConnectorRunStateSchema,
  tunnelStatus: TunnelStatusSchema.nullable(),
  serviceInstalled: z.boolean(),
  // Discovered facts
  os: z.string().nullable(),
  arch: z.string().nullable(),
  cloudflaredVersion: z.string().nullable(),
  connectionCount: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Node = z.infer<typeof NodeSchema>;

/** Payload to create a node. Local needs no SSH; ssh requires connection details. */
export const CreateNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('local'),
    name: z.string().min(1).max(60),
  }),
  z.object({
    kind: z.literal('ssh'),
    name: z.string().min(1).max(60),
    host: z.string().min(1),
    port: z.coerce.number().int().min(1).max(65535).default(22),
    username: z.string().min(1),
    /** Existing private key path on the control-plane machine (optional). */
    privateKeyPath: z.string().optional(),
    /** Reuse a ~/.ssh/config alias to prefill host/user/port/identity. */
    sshConfigAlias: z.string().optional(),
  }),
]);
export type CreateNodeInput = z.infer<typeof CreateNodeSchema>;

export const UpdateNodeSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  host: z.string().min(1).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  username: z.string().min(1).optional(),
  privateKeyPath: z.string().nullable().optional(),
});
export type UpdateNodeInput = z.infer<typeof UpdateNodeSchema>;

export const NodeTestResultSchema = SshTestResultSchema;
export type NodeTestResult = z.infer<typeof NodeTestResultSchema>;

/** Options controlling how a node is provisioned. */
export const ProvisionNodeSchema = z.object({
  /** Install cloudflared as a persistent OS service (recommended). Requires sudo on remote. */
  installService: z.boolean().default(true),
  /** Reuse an existing tunnel by id instead of creating a new one. */
  existingTunnelId: z.string().optional(),
});
export type ProvisionNodeInput = z.infer<typeof ProvisionNodeSchema>;
