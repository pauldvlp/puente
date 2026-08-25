import { describe, expect, it } from 'vitest';
import { classifyProbe } from './probe';

/**
 * The bug this guards against: 530 — what a visitor sees as `Error 1033`, a tunnel with no
 * connector running — used to come back `healthy`, because the check only looked at 502–504.
 * Five live routes read "Healthy" in the panel while every one of them was down.
 */
describe('classifyProbe', () => {
  it('calls a tunnel with no connector unhealthy, and names the error the visitor saw', () => {
    const verdict = classifyProbe(530);
    expect(verdict.health).toBe('unhealthy');
    expect(verdict.message).toContain('1033');
    expect(verdict.message).toContain('connector');
  });

  it.each([500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530, 599])(
    'treats HTTP %i as unhealthy',
    (status) => {
      expect(classifyProbe(status).health).toBe('unhealthy');
    },
  );

  it.each([200, 204, 301, 302, 401, 403, 404, 418, 499])(
    'treats HTTP %i as healthy — the request got through',
    (status) => {
      expect(classifyProbe(status).health).toBe('healthy');
    },
  );

  it('always keeps the bare status in the message', () => {
    expect(classifyProbe(200).message).toBe('HTTP 200');
    expect(classifyProbe(522).message).toMatch(/^HTTP 522 — /);
    expect(classifyProbe(599).message).toMatch(/^HTTP 599 — /);
  });
});
