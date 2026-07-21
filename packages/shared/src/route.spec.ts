import { describe, expect, it } from 'vitest';
import { buildServiceUrl, computeHostname, isValidHostname } from './route.js';
import { subdomainRegex } from './common.js';

describe('buildServiceUrl', () => {
  it('builds a protocol://host:port origin', () => {
    expect(buildServiceUrl({ protocol: 'http', host: 'localhost', port: 7008 })).toBe(
      'http://localhost:7008',
    );
    expect(buildServiceUrl({ protocol: 'https', host: '10.0.0.5', port: 443 })).toBe(
      'https://10.0.0.5:443',
    );
    expect(buildServiceUrl({ protocol: 'ssh', host: 'localhost', port: 22 })).toBe(
      'ssh://localhost:22',
    );
  });

  it('drops the port for unix sockets (the one special case)', () => {
    expect(buildServiceUrl({ protocol: 'unix', host: '/var/run/app.sock', port: 0 })).toBe(
      'unix:/var/run/app.sock',
    );
  });
});

describe('computeHostname', () => {
  it('prefixes the subdomain onto the zone', () => {
    expect(computeHostname('vw', 'example.com')).toBe('vw.example.com');
    expect(computeHostname('a.b', 'example.com')).toBe('a.b.example.com');
  });

  it('maps the apex (@ or empty) to the bare zone', () => {
    expect(computeHostname('@', 'example.com')).toBe('example.com');
    expect(computeHostname('', 'example.com')).toBe('example.com');
  });
});

describe('isValidHostname', () => {
  it('accepts real hostnames', () => {
    expect(isValidHostname('example.com')).toBe(true);
    expect(isValidHostname('vw.example.com')).toBe(true);
    expect(isValidHostname('a-b.example.co.uk')).toBe(true);
  });

  it('rejects malformed ones', () => {
    for (const bad of ['', 'not a host', 'http://example.com', '-lead.example.com', 'a..b.com']) {
      expect(isValidHostname(bad), bad).toBe(false);
    }
  });
});

describe('subdomainRegex', () => {
  it('accepts a label, the apex and the wildcard', () => {
    for (const ok of ['vw', 'my-app', '@', '*', 'a1']) {
      expect(subdomainRegex.test(ok), ok).toBe(true);
    }
  });

  it('rejects dots, spaces and trailing dashes', () => {
    for (const bad of ['a.b', 'has space', 'trail-', '']) {
      expect(subdomainRegex.test(bad), bad).toBe(false);
    }
  });
});
