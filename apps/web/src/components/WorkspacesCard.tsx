import { useState } from 'react';
import { Building2, Check, ExternalLink, Lock, Pencil, Trash2 } from 'lucide-react';
import { UPGRADE_URL } from '@puente/shared';
import { useLicense, useSwitchWorkspace, useWorkspaceMutations, useWorkspaces } from '../lib/hooks';
import { getWorkspaceId } from '../lib/workspace';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Field } from './ui/extras';

/**
 * Lives in the free core on purpose: every install has a workspace, and seeing or naming your own
 * things is not a feature to sell. Only creating more is Pro — enforced by the server, mirrored
 * here so the button explains itself instead of failing.
 */
export function WorkspacesCard() {
  const workspaces = useWorkspaces();
  const license = useLicense();
  const { create, rename, remove } = useWorkspaceMutations();
  const switchTo = useSwitchWorkspace();

  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const unlocked = license.data?.features.includes('workspaces') ?? false;
  const list = workspaces.data ?? [];
  const activeId = getWorkspaceId() ?? list.find((w) => w.isDefault)?.id ?? list[0]?.id;

  return (
    <Card className="mb-6 gap-0 py-0">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <span className="flex items-center gap-2 font-semibold">
          <Building2 className="size-4" /> Workspaces
        </span>
        <Badge variant="muted">
          {list.length} account{list.length === 1 ? '' : 's'}
        </Badge>
      </div>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col divide-y rounded-lg border">
          {list.map((ws) => (
            <div key={ws.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-[12rem] flex-1 flex-col">
                {editing === ws.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename.mutate(
                        { id: ws.id, body: { name: draftName } },
                        { onSuccess: () => setEditing(null) },
                      );
                    }}
                  >
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      aria-label={`New name for ${ws.name}`}
                      autoFocus
                    />
                    <Button type="submit" size="sm" disabled={!draftName.trim()}>
                      <Check className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <span className="flex items-center gap-2 font-medium">
                    {ws.name}
                    {ws.id === activeId && <Badge variant="default">Active</Badge>}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {ws.cloudflareConnected
                    ? (ws.cloudflareAccountName ?? 'Cloudflare connected')
                    : 'No Cloudflare account connected yet'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {ws.id !== activeId && (
                  <Button variant="ghost" size="sm" onClick={() => switchTo(ws.id)}>
                    Switch to
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Rename ${ws.name}`}
                  onClick={() => {
                    setEditing(ws.id);
                    setDraftName(ws.name);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                {list.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${ws.name}`}
                    onClick={() => remove.mutate(ws.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {unlocked ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name: newName.trim() }, { onSuccess: () => setNewName('') });
            }}
          >
            <Field
              label="New workspace"
              htmlFor="workspace-name"
              className="flex-1"
              hint="One per client: its own Cloudflare account, nodes and routes."
            >
              <Input
                id="workspace-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme GmbH"
              />
            </Field>
            <Button type="submit" disabled={!newName.trim() || create.isPending}>
              Add workspace
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                Managing several Cloudflare accounts side by side — one per client, fully isolated —
                is a puente Pro capability. Your workspace and everything in it stay exactly as they
                are on Community.
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
