import { useState } from 'react';
import { Bell, ExternalLink, Lock, Send, Trash2 } from 'lucide-react';
import {
  ALERT_CHANNEL_KINDS,
  ALERT_TRIGGERS,
  TRIGGER_LABELS,
  UPGRADE_URL,
  type AlertChannelKind,
  type AlertTrigger,
} from '@puente/shared';
import { useAlertChannels, useAlertMutations, useLicense } from '../lib/hooks';
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

const KIND_LABELS: Record<AlertChannelKind, string> = {
  webhook: 'Webhook (JSON)',
  slack: 'Slack',
  discord: 'Discord',
};

/** Short forms for the channel list, where the full sentences do not fit. Still English, not
 *  the wire vocabulary: `node.down` is what the API calls it, not what a person calls it. */
const TRIGGER_CHIPS: Record<AlertTrigger, string> = {
  'node.down': 'Node down',
  'node.up': 'Node up',
  'route.down': 'Route down',
  'route.up': 'Route up',
};

const PLACEHOLDERS: Record<AlertChannelKind, string> = {
  webhook: 'https://example.com/hooks/puente',
  slack: 'https://hooks.slack.com/services/…',
  discord: 'https://discord.com/api/webhooks/…',
};

export function AlertsCard() {
  const license = useLicense();
  const unlocked = license.data?.features.includes('alerts') ?? false;
  const channels = useAlertChannels(unlocked);
  const { create, update, remove, test } = useAlertMutations();

  const [name, setName] = useState('');
  // Defaults to the generic webhook: it assumes nothing about where the alert is going, and its
  // payload is the documented one. Slack and Discord are one select away.
  const [kind, setKind] = useState<AlertChannelKind>('webhook');
  const [url, setUrl] = useState('');
  const [triggers, setTriggers] = useState<AlertTrigger[]>([...ALERT_TRIGGERS]);

  const toggleTrigger = (t: AlertTrigger) =>
    setTriggers((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const list = channels.data ?? [];

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Bell className="size-4" /> Alerts
        </span>
        {unlocked ? (
          <Badge variant="muted">
            {list.length} channel{list.length === 1 ? '' : 's'}
          </Badge>
        ) : (
          <Badge variant="default" className="gap-1.5">
            <Lock /> Pro
          </Badge>
        )}
      </div>

      {!unlocked ? (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Get told when a node stops answering or a route starts returning errors — on Slack,
            Discord, or any webhook you point at. Recoveries are sent too, and a cooldown keeps a
            flapping tunnel from becoming a thousand messages.
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
        <div className="flex flex-col gap-5 p-5">
          {list.length > 0 && (
            <div className="flex flex-col divide-y rounded-lg border">
              {list.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-[12rem] flex-1 flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {c.name}
                      <Badge variant="muted">{KIND_LABELS[c.kind]}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">{c.urlPreview}</span>
                    {c.lastError && <span className="text-xs text-destructive">{c.lastError}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.triggers.map((t) => (
                      <Badge key={t} variant="outline">
                        {TRIGGER_CHIPS[t] ?? t}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.enabled}
                      onCheckedChange={(enabled) => update.mutate({ id: c.id, body: { enabled } })}
                      aria-label={`Enable ${c.name}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => test.mutate(c.id)}
                      disabled={test.isPending}
                    >
                      <Send className="size-4" /> Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(c.id)}
                      aria-label={`Remove ${c.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { name, kind, url, triggers, enabled: true },
                {
                  onSuccess: () => {
                    setName('');
                    setUrl('');
                  },
                },
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field label="Name" htmlFor="alert-name">
                <Input
                  id="alert-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Where should this go?"
                />
              </Field>
              <Field label="Send to">
                <Select value={kind} onValueChange={(v) => setKind(v as AlertChannelKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALERT_CHANNEL_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="Webhook URL"
              htmlFor="alert-url"
              hint="Stored encrypted, and never shown again once saved."
            >
              <Input
                id="alert-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={PLACEHOLDERS[kind]}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>

            <Field label="Tell me when">
              <div className="flex flex-wrap gap-2">
                {ALERT_TRIGGERS.map((t) => {
                  const on = triggers.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTrigger(t)}
                      aria-pressed={on}
                      className={
                        on
                          ? 'rounded-full border border-primary bg-primary/12 px-3 py-1 text-xs font-semibold text-primary'
                          : 'rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary/50'
                      }
                    >
                      {TRIGGER_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Button
              type="submit"
              className="w-fit"
              disabled={!name.trim() || !url.trim() || triggers.length === 0 || create.isPending}
            >
              Add channel
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
