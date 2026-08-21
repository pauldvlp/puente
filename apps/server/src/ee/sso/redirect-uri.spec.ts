import { describe, expect, it } from 'vitest';
import { redirectUriFor } from './redirect-uri';

describe('redirectUriFor', () => {
  it('uses the address the browser actually asked for', () => {
    expect(redirectUriFor({ headers: { host: 'panel.local:5006' } })).toBe(
      'http://panel.local:5006/api/sso/callback',
    );
  });

  it('believes the proxy over the socket — puente is often behind one of its own tunnels', () => {
    const uri = redirectUriFor({
      headers: {
        host: '127.0.0.1:5006',
        'x-forwarded-host': 'panel.example.com',
        'x-forwarded-proto': 'https',
      },
    });
    expect(uri).toBe('https://panel.example.com/api/sso/callback');
  });

  it('takes the client-facing entry when several proxies have appended their own', () => {
    const uri = redirectUriFor({
      headers: {
        'x-forwarded-host': 'panel.example.com, internal-lb, 10.0.0.4',
        'x-forwarded-proto': 'https,http',
      },
    });
    expect(uri).toBe('https://panel.example.com/api/sso/callback');
  });

  it('handles a header parsed into a list rather than a string', () => {
    expect(redirectUriFor({ headers: { host: ['a.example', 'b.example'] } })).toBe(
      'http://a.example/api/sso/callback',
    );
  });

  it('still returns a usable URL when nothing says where we are', () => {
    expect(redirectUriFor({ headers: {} })).toBe('http://localhost/api/sso/callback');
  });
});
