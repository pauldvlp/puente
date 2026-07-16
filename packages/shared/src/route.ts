import { z } from 'zod';
import { hostnameRegex, subdomainRegex, portSchema } from './common.js';

/** Supported origin protocols for a route's local service. */
export const ServiceProtocolSchema = z.enum(['http', 'https', 'tcp', 'ssh', 'rdp', 'unix']);
export type ServiceProtocol = z.infer<typeof ServiceProtocolSchema>;

/** The local service a route points cloudflared at (origin). */
export const ServiceTargetSchema = z.object({
  protocol: ServiceProtocolSchema.default('http'),
  /** Host as seen from the node running the connector. Usually localhost. */
  host: z.string().default('localhost'),
  port: portSchema,
});
export type ServiceTarget = z.infer<typeof ServiceTargetSchema>;

/** Subset of Cloudflare ingress originRequest options we expose in the UI. */
export const OriginRequestOptionsSchema = z.object({
  noTLSVerify: z.boolean().optional(),
  httpHostHeader: z.string().optional(),
  originServerName: z.string().optional(),
  connectTimeout: z.number().int().min(1).max(3600).optional(),
  http2Origin: z.boolean().optional(),
});
export type OriginRequestOptions = z.infer<typeof OriginRequestOptionsSchema>;

export const RouteStatusSchema = z.enum(['active', 'pending', 'error', 'disabled']);
export type RouteStatus = z.infer<typeof RouteStatusSchema>;

export const RouteHealthSchema = z.enum(['healthy', 'unhealthy', 'unknown']);
export type RouteHealth = z.infer<typeof RouteHealthSchema>;

export const RouteSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  // Destination hostname
  hostname: z.string(), // full: vw.gdy.me
  subdomain: z.string(), // "vw" or "@"
  zoneId: z.string(),
  zoneName: z.string(), // gdy.me
  // Origin service on the node
  service: ServiceTargetSchema,
  path: z.string().nullable(),
  originRequest: OriginRequestOptionsSchema.nullable(),
  // Cloudflare bookkeeping
  dnsRecordId: z.string().nullable(),
  // State
  enabled: z.boolean(),
  status: RouteStatusSchema,
  health: RouteHealthSchema,
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Route = z.infer<typeof RouteSchema>;

export const CreateRouteSchema = z.object({
  nodeId: z.string().min(1),
  zoneId: z.string().min(1),
  /** Leftmost label, e.g. "vw"; "@" publishes on the zone apex. */
  subdomain: z.string().regex(subdomainRegex, 'Invalid subdomain'),
  service: ServiceTargetSchema,
  path: z.string().optional(),
  originRequest: OriginRequestOptionsSchema.optional(),
  enabled: z.boolean().default(true),
});
export type CreateRouteInput = z.infer<typeof CreateRouteSchema>;

export const UpdateRouteSchema = z.object({
  service: ServiceTargetSchema.optional(),
  path: z.string().nullable().optional(),
  originRequest: OriginRequestOptionsSchema.nullable().optional(),
  enabled: z.boolean().optional(),
});
export type UpdateRouteInput = z.infer<typeof UpdateRouteSchema>;

export const RouteCheckResultSchema = z.object({
  health: RouteHealthSchema,
  httpStatus: z.number().nullable(),
  message: z.string(),
  checkedAt: z.string(),
});
export type RouteCheckResult = z.infer<typeof RouteCheckResultSchema>;

/** Build the Cloudflare ingress `service` string from a target, e.g. "http://localhost:7008". */
export function buildServiceUrl(t: ServiceTarget): string {
  if (t.protocol === 'unix') return `unix:${t.host}`;
  return `${t.protocol}://${t.host}:${t.port}`;
}

/** Compute the full hostname from a subdomain label + zone name. */
export function computeHostname(subdomain: string, zoneName: string): string {
  if (subdomain === '@' || subdomain === '') return zoneName;
  return `${subdomain}.${zoneName}`;
}

export function isValidHostname(hostname: string): boolean {
  return hostnameRegex.test(hostname);
}
