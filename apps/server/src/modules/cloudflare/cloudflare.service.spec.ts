import { describe, expect, it, vi } from 'vitest';
import { CloudflareService } from './cloudflare.service';
import type { SettingsService } from '../settings/settings.service';

/**
 * The SDK is doubled at the `client()` seam, so these assert the wrapper's contract
 * with Cloudflare — not the network. The catch-all is the load-bearing bit: an ingress
 * list without a terminal rule makes the tunnel reject every request.
 */
function withFakeSdk() {
  const update = vi.fn().mockResolvedValue({});
  const cf = { zeroTrust: { tunnels: { cloudflared: { configurations: { update } } } } };
  const svc = new CloudflareService({} as unknown as SettingsService);
  vi.spyOn(svc as unknown as { client: () => unknown }, 'client').mockReturnValue({
    cf,
    accountId: 'acct_1',
  });
  const ingressOf = () => update.mock.calls[0][1].config.ingress;
  return { svc, update, ingressOf };
}

describe('CloudflareService.putIngress', () => {
  it('appends the mandatory http_status:404 catch-all after the caller rules', async () => {
    const { svc, ingressOf } = withFakeSdk();

    await svc.putIngress('tun_1', [
      { hostname: 'a.example.com', service: 'http://localhost:1000' },
    ]);

    const ingress = ingressOf();
    expect(ingress).toHaveLength(2);
    expect(ingress[0]).toMatchObject({ hostname: 'a.example.com' });
    expect(ingress.at(-1)).toEqual({ service: 'http_status:404' });
  });

  it('sends the catch-all even with no rules — an empty ingress breaks the tunnel', async () => {
    const { svc, ingressOf } = withFakeSdk();
    await svc.putIngress('tun_1', []);
    expect(ingressOf()).toEqual([{ service: 'http_status:404' }]);
  });

  it('targets the tunnel and account it was given', async () => {
    const { svc, update } = withFakeSdk();
    await svc.putIngress('tun_42', []);
    expect(update.mock.calls[0][0]).toBe('tun_42');
    expect(update.mock.calls[0][1].account_id).toBe('acct_1');
  });
});
