/** The only part of the request this needs, declared here rather than pulling in express's types. */
export interface OriginHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * The redirect URI has to match what is registered with the provider, character for character,
 * and puente does not know its own public URL — it might well be behind one of its own tunnels.
 * So it reads the address the browser used to get here, honouring the proxy headers a tunnel
 * sets, and the settings screen shows the result so it can be registered verbatim.
 *
 * Taken from the request rather than from a parameter the caller supplies: the value ends up in
 * an `authorize` URL, and one an attacker can choose is one they can aim somewhere else.
 */
export function redirectUriFor(req: OriginHeaders): string {
  // A chain of proxies appends to these, so the client-facing one is the first entry.
  const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? (value[0] ?? '') : (value ?? '')).split(',')[0].trim();

  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host) || 'localhost';
  const proto = first(req.headers['x-forwarded-proto']) || 'http';
  return `${proto}://${host}/api/sso/callback`;
}
