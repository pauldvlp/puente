import { useState } from 'react';
import { Archive, ExternalLink, HardDriveDownload, Lock, Trash2 } from 'lucide-react';
import { BACKUP_FREQUENCIES, UPGRADE_URL, WEEKDAYS, type BackupFrequency } from '@puente/shared';
import { useBackupFiles, useBackupMutations, useBackupSchedule, useLicense } from '../lib/hooks';
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
import { absoluteTime, relativeTime } from '../lib/format';

const kb = (bytes: number): string =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;

export function BackupsCard() {
  const license = useLicense();
  const unlocked = license.data?.features.includes('backup') ?? false;
  const schedule = useBackupSchedule(unlocked);
  const files = useBackupFiles(unlocked);
  const { update, run, remove } = useBackupMutations();

  const [passphrase, setPassphrase] = useState('');

  const s = schedule.data;

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Archive className="size-4" /> Scheduled backups
        </span>
        {unlocked ? (
          s?.enabled ? (
            <Badge variant="success">On</Badge>
          ) : (
            <Badge variant="muted">Off</Badge>
          )
        ) : (
          <Badge variant="default" className="gap-1.5">
            <Lock /> Pro
          </Badge>
        )}
      </div>

      {!unlocked ? (
        <div className="flex flex-col gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Backups that happen without anyone remembering: on a schedule, encrypted, with old ones
            pruned for you.{' '}
            <span className="text-foreground">
              Taking one by hand is free and always will be — run{' '}
              <code className="mono rounded bg-muted px-1 py-0.5 text-xs">puente backup</code>.
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
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={s?.enabled ?? false}
                onCheckedChange={(enabled) => update.mutate({ enabled })}
                aria-label="Run backups on a schedule"
                disabled={!s?.hasPassphrase}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Run on a schedule</span>
                <span className="text-xs text-muted-foreground">
                  {s?.nextRunAt
                    ? `Next ${relativeTime(s.nextRunAt)} · ${absoluteTime(s.nextRunAt)}`
                    : s?.hasPassphrase
                      ? 'Off — nothing is scheduled.'
                      : 'Set a passphrase first.'}
                </span>
              </div>
            </div>
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              <HardDriveDownload className="size-4" /> Back up now
            </Button>
          </div>

          {s?.lastError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Last run failed: {s.lastError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="How often">
              <Select
                value={s?.frequency ?? 'daily'}
                onValueChange={(v) => update.mutate({ frequency: v as BackupFrequency })}
              >
                <SelectTrigger aria-label="How often">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKUP_FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f === 'daily' ? 'Every day' : 'Every week'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {s?.frequency === 'weekly' && (
              <Field label="Day">
                <Select
                  value={String(s?.weekday ?? 0)}
                  onValueChange={(v) => update.mutate({ weekday: Number(v) })}
                >
                  <SelectTrigger aria-label="Day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="At" hint="Your server's local time.">
              <Select
                value={String(s?.hour ?? 3)}
                onValueChange={(v) => update.mutate({ hour: Number(v) })}
              >
                <SelectTrigger aria-label="At">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Keep" hint="Older files are deleted after a successful run.">
              <Input
                type="number"
                min={1}
                max={365}
                value={s?.keep ?? 7}
                aria-label="How many to keep"
                onChange={(e) => {
                  const keep = Number(e.target.value);
                  if (keep >= 1 && keep <= 365) update.mutate({ keep });
                }}
              />
            </Field>
          </div>

          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate({ passphrase }, { onSuccess: () => setPassphrase('') });
            }}
          >
            <Field
              label={s?.hasPassphrase ? 'Replace the passphrase' : 'Passphrase'}
              htmlFor="backup-passphrase"
              className="flex-1"
              hint="Every backup is encrypted with it. Keep a copy somewhere this server is not — without it the files are unreadable."
            >
              <Input
                id="backup-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="new-password"
                placeholder={s?.hasPassphrase ? '••••••••' : 'Choose something long'}
              />
            </Field>
            <Button type="submit" disabled={!passphrase || update.isPending}>
              Save
            </Button>
          </form>

          {(files.data ?? []).length > 0 && (
            <div className="flex flex-col divide-y rounded-lg border">
              {(files.data ?? []).map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-sm">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {kb(f.bytes)} · {relativeTime(f.createdAt)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${f.name}`}
                    onClick={() => remove.mutate(f.name)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Files are written to <code className="mono">{s?.directory}</code>. Restore one with{' '}
            <code className="mono">puente restore &lt;file&gt;</code>, with the panel stopped.
          </p>
        </div>
      )}
    </Card>
  );
}
