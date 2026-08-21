import { useState } from 'react';
import { Building2, Check, Copy, ExternalLink, Lock } from 'lucide-react';
import { ROLE_LABELS, ROLES, UPGRADE_URL, type Role } from '@puente/shared';
import { useAuth } from '../lib/auth';
import { useLicense, useSsoConfig, useSsoMutations } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Field } from '../components/ui/extras';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

interface Editable {
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  allowedDomain: string;
  defaultRole: Role;
  enabled: boolean;
}

/**
 * Single sign-on, configured by the owner and nobody else — it decides who gets into the panel,
 * which is not an operator's call. Non-owners never see this card at all.
 */
export function SsoCard() {
  const { user } = useAuth();
  const license = useLicense();
  const isOwner = user?.role === 'owner';
  const unlocked = license.data?.features.includes('sso') ?? false;
  const config = useSsoConfig(isOwner && unlocked);
  const save = useSsoMutations();

  // Only what someone has typed lives here; everything else is read straight off the stored
  // configuration. Nothing to copy in when it arrives, and nothing to go stale if it changes.
  const [draft, setDraft] = useState<Partial<Editable>>({});
  const [copied, setCopied] = useState(false);

  const c = config.data;
  const form: Editable = {
    label: draft.label ?? c?.label ?? '',
    issuer: draft.issuer ?? c?.issuer ?? '',
    clientId: draft.clientId ?? c?.clientId ?? '',
    // The secret is never sent back, so the box starts empty — and empty means "keep it".
    clientSecret: draft.clientSecret ?? '',
    allowedDomain: draft.allowedDomain ?? c?.allowedDomain ?? '',
    defaultRole: draft.defaultRole ?? c?.defaultRole ?? 'operator',
    enabled: draft.enabled ?? c?.enabled ?? false,
  };

  if (!isOwner) return null;

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Building2 className="size-4" /> Single sign-on
        </span>
        {!unlocked ? (
          <Badge variant="default" className="gap-1.5">
            <Lock /> Pro
          </Badge>
        ) : c?.enabled ? (
          <Badge variant="success">On</Badge>
        ) : (
          <Badge variant="muted">Off</Badge>
        )}
      </div>

      {!unlocked ? (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Let people in with the accounts your company already manages — Okta, Entra, Google,
            anything that speaks OpenID Connect. Someone who leaves loses access the moment IT
            disables them, without anyone remembering to come here.{' '}
            <span className="text-foreground">
              An identity provider already set up keeps working even if the licence lapses.
            </span>
          </p>
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Compare editions <ExternalLink className="size-3.5" />
          </a>
        </div>
      ) : (
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                ...form,
                // An untouched box means "keep the stored secret", not "clear it".
                clientSecret: form.clientSecret || undefined,
              },
              // What comes back is the truth; the typed-in copy has done its job.
              { onSuccess: () => setDraft({}) },
            );
          }}
        >
          {c?.lastError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Last sign-in attempt failed: {c.lastError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Redirect URI</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                {c?.redirectUri ?? ''}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(c?.redirectUri ?? '');
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              Register this with your provider, exactly as it reads.
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Issuer URL"
              htmlFor="sso-issuer"
              hint="puente reads the endpoints from its discovery document."
            >
              <Input
                id="sso-issuer"
                value={form.issuer}
                onChange={(e) => set('issuer', e.target.value)}
                placeholder="https://accounts.google.com"
              />
            </Field>
            <Field label="Button label" htmlFor="sso-label" hint="What the login screen calls it.">
              <Input
                id="sso-label"
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="Okta"
              />
            </Field>
            <Field label="Client ID" htmlFor="sso-client-id">
              <Input
                id="sso-client-id"
                value={form.clientId}
                onChange={(e) => set('clientId', e.target.value)}
              />
            </Field>
            <Field
              label="Client secret"
              htmlFor="sso-client-secret"
              hint={c?.hasClientSecret ? 'Stored. Leave blank to keep it.' : undefined}
            >
              <Input
                id="sso-client-secret"
                type="password"
                autoComplete="off"
                value={form.clientSecret}
                onChange={(e) => set('clientSecret', e.target.value)}
                placeholder={c?.hasClientSecret ? '••••••••' : ''}
              />
            </Field>
            <Field
              label="Only this email domain"
              htmlFor="sso-domain"
              hint="Blank lets anyone your provider authenticates in."
            >
              <Input
                id="sso-domain"
                value={form.allowedDomain}
                onChange={(e) => set('allowedDomain', e.target.value)}
                placeholder="example.com"
              />
            </Field>
            <Field label="Role for a first sign-in">
              <Select value={form.defaultRole} onValueChange={(v) => set('defaultRole', v as Role)}>
                <SelectTrigger aria-label="Role for a first sign-in">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => set('enabled', enabled)}
                aria-label="Show the sign-in button"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Show the button on the login screen</span>
                <span className="text-xs text-muted-foreground">
                  Passwords keep working either way, so a misconfiguration cannot lock you out.
                </span>
              </div>
            </div>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
