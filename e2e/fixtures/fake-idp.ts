import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';

/**
 * An OpenID Connect provider, small enough to read.
 *
 * The real ones cannot be reached from CI, and mocking puente's own HTTP calls would test the
 * mock. This serves the four things an OIDC client actually talks to — discovery, authorize,
 * token, JWKS — signs a real RS256 id_token with a key it generates on the spot, and checks the
 * PKCE verifier the way a provider would. If puente's flow is wrong, this refuses it.
 */
export interface FakeIdp {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Who the next sign-in will be. */
  signInAs(claims: { email?: string; sub?: string; name?: string }): void;
  /** Make the next /authorize bounce back with an error, like a user hitting "deny". */
  refuseNext(error: string): void;
  /** The form puente posted to /token, for asserting PKCE actually happened. */
  lastTokenRequest(): URLSearchParams | null;
  close(): Promise<void>;
}

const b64 = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

export async function startFakeIdp(): Promise<FakeIdp> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = randomBytes(8).toString('hex');
  const clientId = 'puente-e2e';
  const clientSecret = 'e2e-client-secret';

  const codes = new Map<string, { nonce: string; challenge: string }>();
  let user = { email: 'someone@example.com', sub: 'sub-1', name: 'Someone' };
  let refusal: string | null = null;
  let lastToken: URLSearchParams | null = null;
  let issuer = '';

  const idToken = (nonce: string): string => {
    const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64(
      JSON.stringify({
        iss: issuer,
        aud: clientId,
        sub: user.sub,
        email: user.email,
        name: user.name,
        nonce,
        iat: now,
        exp: now + 300,
      }),
    );
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey);
    return `${header}.${payload}.${b64(signature)}`;
  };

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => resolve(raw));
    });

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', issuer || 'http://127.0.0.1');

      if (url.pathname === '/.well-known/openid-configuration') {
        send(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          id_token_signing_alg_values_supported: ['RS256'],
        });
        return;
      }

      if (url.pathname === '/jwks') {
        const jwk = publicKey.export({ format: 'jwk' });
        send(res, 200, { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] });
        return;
      }

      if (url.pathname === '/authorize') {
        const back = new URL(url.searchParams.get('redirect_uri') ?? '');
        const state = url.searchParams.get('state') ?? '';
        if (refusal) {
          back.searchParams.set('error', refusal);
          refusal = null;
        } else {
          const code = randomBytes(12).toString('hex');
          codes.set(code, {
            nonce: url.searchParams.get('nonce') ?? '',
            challenge: url.searchParams.get('code_challenge') ?? '',
          });
          back.searchParams.set('code', code);
        }
        back.searchParams.set('state', state);
        res.writeHead(302, { Location: back.toString() });
        res.end();
        return;
      }

      if (url.pathname === '/token' && req.method === 'POST') {
        const form = new URLSearchParams(await readBody(req));
        lastToken = form;
        const entry = codes.get(form.get('code') ?? '');
        if (!entry) return send(res, 400, { error: 'invalid_grant' });
        codes.delete(form.get('code') ?? '');

        if (form.get('client_id') !== clientId || form.get('client_secret') !== clientSecret) {
          return send(res, 401, { error: 'invalid_client' });
        }
        // A provider that skipped this would let a stolen code be redeemed by anyone.
        const verifier = form.get('code_verifier') ?? '';
        const computed = createHash('sha256').update(verifier).digest('base64url');
        if (!verifier || computed !== entry.challenge) {
          return send(res, 400, { error: 'invalid_grant', error_description: 'PKCE mismatch' });
        }
        return send(res, 200, {
          access_token: randomBytes(16).toString('hex'),
          token_type: 'Bearer',
          expires_in: 300,
          id_token: idToken(entry.nonce),
        });
      }

      send(res, 404, { error: 'not_found' });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    issuer,
    clientId,
    clientSecret,
    signInAs: (claims) => {
      user = { ...user, ...claims };
    },
    refuseNext: (error) => {
      refusal = error;
    },
    lastTokenRequest: () => lastToken,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
