import { z } from 'zod';

/** ISO-8601 timestamp string. */
export const zIsoDate = z.string();

/** Common entity timestamps (stored as epoch-millis integers, exposed as ISO strings). */
export const TimestampsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Timestamps = z.infer<typeof TimestampsSchema>;

/** Standard API error payload returned by the backend. */
export const ApiErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  /** Machine-readable code for the frontend to branch on. */
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const OkSchema = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof OkSchema>;

/** A subset of RFC-1123 hostname validation for a single DNS label / full hostname. */
export const hostnameRegex =
  /^(?=.{1,253}$)(\*\.)?([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/** A single DNS label (leftmost part of a subdomain), or "@" for the zone apex. */
export const subdomainRegex = /^(@|\*|[a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)$/;

export const portSchema = z.coerce.number().int().min(1).max(65535);

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int(),
  });
}
