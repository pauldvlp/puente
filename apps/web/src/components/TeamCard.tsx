import { useState } from 'react';
import { ExternalLink, Lock, Trash2, Users } from 'lucide-react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, UPGRADE_URL, type Role } from '@puente/shared';
import { useLicense, useTeam, useTeamMutations } from '../lib/hooks';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Field } from './ui/extras';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

/**
 * In the free core: every install has an account, and seeing or renaming it is not something to
 * sell. Adding a second one is Pro — enforced by the server, mirrored here so the form explains
 * itself instead of failing.
 */
export function TeamCard() {
  const team = useTeam();
  const license = useLicense();
  const { create, update, remove } = useTeamMutations();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('operator');

  const unlocked = license.data?.features.includes('team') ?? false;
  const members = team.data ?? [];
  const seats = license.data?.seats ?? null;
  const seatsUsed = members.length;
  const seatsLeft = seats === null ? null : Math.max(0, seats - seatsUsed);

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Users className="size-4" /> Team
        </span>
        {unlocked ? (
          <Badge variant="muted">
            {seats === null ? `${seatsUsed} accounts` : `${seatsUsed} of ${seats} seats`}
          </Badge>
        ) : (
          <Badge variant="default" className="gap-1.5">
            <Lock /> Pro
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col divide-y rounded-lg border">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-[10rem] flex-1 flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {m.username}
                  {m.isYou && <Badge variant="default">You</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[m.role]}</span>
              </div>

              {unlocked ? (
                <Select
                  value={m.role}
                  onValueChange={(value) =>
                    update.mutate({ id: m.id, body: { role: value as Role } })
                  }
                >
                  <SelectTrigger className="w-[9.5rem]" aria-label={`Role for ${m.username}`}>
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
              ) : (
                <Badge variant="outline">{ROLE_LABELS[m.role]}</Badge>
              )}

              {unlocked && !m.isYou && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${m.username}`}
                  onClick={() => remove.mutate(m.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {unlocked ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { username: username.trim(), password, role },
                {
                  onSuccess: () => {
                    setUsername('');
                    setPassword('');
                  },
                },
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_10rem]">
              <Field label="Username" htmlFor="team-username">
                <Input
                  id="team-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ana"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Password"
                htmlFor="team-password"
                hint="They can change it once they are in."
              >
                <Input
                  id="team-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Role">
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger aria-label="Role for the new account">
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

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={
                  !username.trim() || password.length < 8 || create.isPending || seatsLeft === 0
                }
              >
                Add account
              </Button>
              {seatsLeft === 0 && (
                <span className="text-sm text-warning">Every seat on your licence is in use.</span>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                More than one account — with roles, so an operator can publish routes without being
                able to disconnect Cloudflare — is a puente Pro capability. Your account keeps every
                permission it has today.
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
