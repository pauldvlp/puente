import type { RouteHealth } from '@puente/shared';

export interface ProbeVerdict {
  health: RouteHealth;
  message: string;
}

/**
 * What the edge answers when it cannot serve a hostname.
 *
 * Cloudflare does not report a broken tunnel as 502–504. It answers 520–527 when it cannot get
 * a valid response out of the origin, and **530** for "this hostname is a tunnel and I cannot
 * resolve it" — the page a visitor reads as `Error 1033`. This check used to treat only 502–504
 * as down, so a tunnel with no connector running came back `healthy`: the badge was right
 * whenever it did not matter and wrong in the one case it exists for.
 */
const EDGE_REASONS: Record<number, string> = {
  502: 'the edge could not reach the origin',
  503: 'the origin is unavailable',
  504: 'the origin timed out',
  520: 'Cloudflare got an invalid response from the origin',
  521: 'the origin refused the connection — is the local service listening?',
  522: 'the connection to the origin timed out',
  523: 'the origin is unreachable from the connector',
  524: 'the origin took too long to answer',
  525: 'the TLS handshake with the origin failed',
  526: "the origin's certificate is not valid",
  527: 'the connector lost its connection to Cloudflare',
  530: 'Cloudflare could not reach the tunnel (error 1033) — the connector is probably not running',
};

/**
 * A route is healthy when the request got through. Any 5xx counts as down — including a plain
 * 500, where the tunnel works but the service behind it does not. The message says which of the
 * two failed, so the user knows whether to look at puente or at their own app.
 */
export function classifyProbe(status: number): ProbeVerdict {
  if (status < 500) return { health: 'healthy', message: `HTTP ${status}` };
  return {
    health: 'unhealthy',
    message: `HTTP ${status} — ${EDGE_REASONS[status] ?? 'the origin returned a server error'}`,
  };
}
