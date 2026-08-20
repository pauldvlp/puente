import { useState } from 'react';
import { BadgeCheck, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { UPGRADE_URL, type ProFeature } from '@puente/shared';
import { useLicense, useLicenseMutations } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Field } from '../components/ui/extras';

const FEATURE_LABELS: Record<ProFeature, string> = {
  team: 'Team accounts & roles',
  sso: 'Single sign-on (OIDC)',
  audit: 'Exportable audit log',
  backup: 'Scheduled backups',
  alerts: 'Alerting',
  workspaces: 'Client workspaces',
  api: 'API tokens',
  fleet: 'Fleet operations',
};

const PLAN_LABELS: Record<string, string> = {
  pro: 'Pro',
  agency: 'Agency',
  enterprise: 'Enterprise',
};

export function LicenseCard() {
  const license = useLicense();
  const { activate, deactivate } = useLicenseMutations();
  const [key, setKey] = useState('');

  const data = license.data;
  const isPro = data?.edition === 'pro';

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> License
        </span>
        {isPro ? (
          <Badge variant={data.inGrace ? 'warning' : 'success'} className="gap-1.5">
            <BadgeCheck /> puente {PLAN_LABELS[data.plan ?? 'pro'] ?? 'Pro'}
          </Badge>
        ) : (
          <Badge variant="muted">Community</Badge>
        )}
      </div>

      <div className="p-5">
        {isPro ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Licensed to</span>
                <span className="font-semibold">{data.licensee}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">Seats</span>
                <span className="font-semibold">{data.seats ?? 'Unlimited'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">
                  {data.inGrace ? 'Grace period' : 'Renews'}
                </span>
                <span className="font-semibold">
                  {data.expiresAt
                    ? new Date(data.expiresAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Perpetual'}
                  {data.daysRemaining !== null && (
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      ({data.daysRemaining}d)
                    </span>
                  )}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deactivate.mutate()}
                disabled={deactivate.isPending}
              >
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>

            {data.inGrace && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                This license expired. Pro features keep working for {data.daysRemaining} more day(s)
                — renew to avoid losing them. Tunnels and routes are unaffected either way.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {data.features.map((f) => (
                <Badge key={f} variant="outline">
                  {FEATURE_LABELS[f] ?? f}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              You are running{' '}
              <span className="font-semibold text-foreground">puente Community</span>, free and open
              source under the AGPL. Unlimited nodes, unlimited routes, no telemetry. A Pro license
              adds team accounts, client workspaces, alerting, backups and an exportable audit log.
            </p>

            {data?.problem === 'expired' && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                The license key stored here has expired. Pro features are off; everything else keeps
                running.
              </p>
            )}

            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                if (key.trim())
                  activate.mutate({ key: key.trim() }, { onSuccess: () => setKey('') });
              }}
            >
              <Field
                label="License key"
                htmlFor="license-key"
                className="flex-1"
                hint="Verified offline — puente never contacts a license server."
              >
                <Input
                  id="license-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="puente-lic-v1…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Button type="submit" disabled={!key.trim() || activate.isPending}>
                Activate
              </Button>
            </form>

            <a
              href={UPGRADE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Compare editions <ExternalLink className="size-3.5" />
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}
