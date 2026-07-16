import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink, KeyRound, ShieldCheck } from 'lucide-react';
import type { CloudflareZone } from '@puente/shared';
import { api, type ScopeItem, type VerifyTokenResult } from '../lib/api';
import { useCloudflareMutations } from '../lib/hooks';
import { errMessage } from '../lib/hooks';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Field } from './ui/extras';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens';

const FALLBACK_SCOPES: ScopeItem[] = [
  { category: 'Account', group: 'Cloudflare Tunnel', access: 'Edit', reason: 'Create & configure tunnels' },
  { category: 'Zone', group: 'DNS', access: 'Edit', reason: 'Create routing DNS records' },
  { category: 'Zone', group: 'Zone', access: 'Read', reason: 'List your domains' },
  { category: 'Account', group: 'Account Settings', access: 'Read', reason: 'Discover your account id' },
];

export function ScopeGuide({ scopes }: { scopes: ScopeItem[] }) {
  return (
    <div className="rounded-2xl border bg-muted/50 p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <span className="font-semibold">Create a token with exactly these permissions</span>
        </div>
        <ol className="ml-4 flex list-decimal flex-col gap-2 text-sm text-muted-foreground">
          <li>
            Open{' '}
            <a
              href={TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              dash.cloudflare.com → My Profile → API Tokens{' '}
              <ExternalLink className="inline size-3" />
            </a>{' '}
            and click <b className="text-foreground">Create Token → Create Custom Token</b>.
          </li>
          <li>
            Under <b className="text-foreground">Permissions</b>, add each row below (Category · Group · Access).
          </li>
          <li>
            Set <b className="text-foreground">Account Resources</b> = your account,{' '}
            <b className="text-foreground">Zone Resources</b> = All zones, then create and copy the token.
          </li>
        </ol>
        <div className="mt-1 flex flex-col gap-1.5">
          {scopes.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{s.category}</Badge>
              <ArrowRight className="size-3 text-muted-foreground" />
              <Badge variant="muted">{s.group}</Badge>
              <ArrowRight className="size-3 text-muted-foreground" />
              <Badge variant="cf">{s.access}</Badge>
              <span className="text-xs text-muted-foreground">{s.reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConnectCloudflare({ onConnected }: { onConnected?: () => void }) {
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifyTokenResult | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [scopes, setScopes] = useState<ScopeItem[]>(FALLBACK_SCOPES);
  const { connect } = useCloudflareMutations();

  // Load exact scope names from the backend once.
  useEffect(() => {
    api.cloudflare
      .scopes()
      .then((r) => setScopes(r.scopes))
      .catch(() => undefined);
  }, []);

  const doVerify = async () => {
    setVerifying(true);
    setVerifyErr(null);
    try {
      const res = await api.cloudflare.verify(token.trim());
      setVerified(res);
      setAccountId(res.accounts[0]?.id ?? '');
      if (res.accounts.length === 0) {
        setVerifyErr('Token is valid but no accounts are visible — add "Account Settings: Read".');
      }
    } catch (e) {
      setVerifyErr(errMessage(e));
    } finally {
      setVerifying(false);
    }
  };

  const doConnect = () => {
    connect.mutate(
      { apiToken: token.trim(), accountId: accountId || undefined },
      { onSuccess: () => onConnected?.() },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <ScopeGuide scopes={scopes} />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 p-5">
          <Field label="API Token" hint="Pasted once and stored encrypted (AES-256-GCM) on this machine." htmlFor="cf-token">
            <div className="flex gap-2">
              <div className="relative grow">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="cf-token"
                  type="password"
                  placeholder="Paste your Cloudflare API token"
                  value={token}
                  className="pl-9"
                  onChange={(e) => {
                    setToken(e.target.value);
                    setVerified(null);
                    setVerifyErr(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && token && !verified && doVerify()}
                />
              </div>
              {!verified && (
                <Button onClick={doVerify} loading={verifying} disabled={!token.trim()}>
                  Verify
                </Button>
              )}
            </div>
          </Field>

          {verifyErr && <div className="text-sm font-medium text-destructive">{verifyErr}</div>}

          {verified && verified.accounts.length > 0 && (
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                <span className="font-semibold">
                  Token valid · {verified.zones.length} domain{verified.zones.length === 1 ? '' : 's'} found
                </span>
              </div>

              {verified.accounts.length > 1 && (
                <Field label="Account">
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {verified.accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              <ZoneChips zones={verified.zones} />

              <Button onClick={doConnect} loading={connect.isPending}>
                {!connect.isPending && <CheckCircle2 className="size-4" />}
                Connect this account
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ZoneChips({ zones }: { zones: CloudflareZone[] }) {
  if (zones.length === 0) return <span className="text-sm text-muted-foreground">No zones visible for this token.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {zones.slice(0, 10).map((z) => (
        <Badge key={z.id} variant="muted">
          {z.name}
        </Badge>
      ))}
      {zones.length > 10 && <Badge variant="muted">+{zones.length - 10} more</Badge>}
    </div>
  );
}
