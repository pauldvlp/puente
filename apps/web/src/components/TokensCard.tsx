import { useState } from 'react';
import { Check, Copy, ExternalLink, KeySquare, Lock, Trash2 } from 'lucide-react';
import { ROLE_LABELS, ROLES, UPGRADE_URL, type CreatedApiToken, type Role } from '@puente/shared';
import { useApiTokens, useApiTokenMutations, useLicense } from '../lib/hooks';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Field } from './ui/extras';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { relativeTime } from '../lib/format';

/**
 * Listing tokens is free — knowing what can reach your panel, and when it last did, is security
 * hygiene rather than a feature. Issuing them is Pro.
 */
export function TokensCard() {
  const license = useLicense();
  const tokens = useApiTokens();
  const { create, revoke } = useApiTokenMutations();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [issued, setIssued] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);

  const unlocked = license.data?.features.includes('api') ?? false;
  const list = tokens.data ?? [];

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <KeySquare className="size-4" /> API tokens
        </span>
        {unlocked ? (
          <Badge variant="muted">
            {list.length} token{list.length === 1 ? '' : 's'}
          </Badge>
        ) : (
          <Badge variant="default" className="gap-1.5">
            <Lock /> Pro
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-5 p-5">
        {list.length > 0 && (
          <div className="flex flex-col divide-y rounded-lg border">
            {list.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-[10rem] flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {t.name}
                    <Badge variant="outline">{ROLE_LABELS[t.role]}</Badge>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{t.hint}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.lastUsedAt ? `used ${relativeTime(t.lastUsedAt)}` : 'never used'}
                  {t.expiresAt && ` · expires ${relativeTime(t.expiresAt)}`}
                </span>
                {unlocked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke ${t.name}`}
                    onClick={() => revoke.mutate(t.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {issued && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
            <span className="text-sm font-semibold">
              Copy it now — this is the only time it is shown.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="mono min-w-0 flex-1 truncate rounded bg-background px-3 py-2 text-sm">
                {issued.token}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.token);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              Use it as <code className="mono">Authorization: Bearer {issued.hint}</code>
            </span>
          </div>
        )}

        {unlocked ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { name: name.trim(), role },
                {
                  onSuccess: (token) => {
                    setIssued(token);
                    setCopied(false);
                    setName('');
                  },
                },
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field
                label="What will use it"
                htmlFor="token-name"
                hint="Name it after the script or the pipeline, so a stale one is obvious later."
              >
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="deploy pipeline"
                />
              </Field>
              <Field label="Role">
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger aria-label="Role for the token">
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
            <Button type="submit" className="w-fit" disabled={!name.trim() || create.isPending}>
              Create token
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                Tokens let a script or a pipeline drive puente without a password, with a role of
                their own — a deploy job that publishes routes but cannot disconnect Cloudflare.
                Issuing them is a puente Pro capability; tokens you already have keep working.
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
        )}
      </div>
    </Card>
  );
}
