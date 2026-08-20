import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('is the version npm publishes, not a copy of it', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).not.toBe('0.0.0-unknown');
  });

  it('looks like a semver release', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
  });
});
