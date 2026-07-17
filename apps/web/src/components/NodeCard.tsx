import { useState } from 'react';
import {
  AlertTriangle,
  Cable,
  KeyRound,
  Laptop,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Server,
  Square,
  Terminal,
  Trash2,
  Rocket,
} from 'lucide-react';
import type { Node as PuenteNode } from '@puente/shared';
import { useNodeMutations } from '../lib/hooks';
import { useProgress } from '../lib/live';
import { relativeTime } from '../lib/format';
import { connectorStateMeta, nodeHeadlineMeta, tunnelStatusMeta } from '../lib/status';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { Field, StatusBadge } from './ui/extras';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

export function NodeCard({
  node,
  routeCount,
  onAddRoute,
}: {
  node: PuenteNode;
  routeCount: number;
  onAddRoute: (nodeId: string) => void;
}) {
  const m = useNodeMutations();
  const progress = useProgress(`node:${node.id}`);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isProvisioning = node.provisionState === 'provisioning' || m.provision.isPending;
  const provisioned = node.provisionState === 'provisioned';
  const headline = nodeHeadlineMeta(node);
  const Icon = node.kind === 'local' ? Laptop : Server;

  const runTest = () =>
    m.test.mutate(node.id, {
      onSuccess: (r) =>
        setTestResult(
          r.authenticated
            ? `Connected · ${r.os ?? '?'}/${r.arch ?? '?'}${r.cloudflaredVersion ? ` · cloudflared ${r.cloudflaredVersion}` : ''}`
            : r.message,
        ),
    });

  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-[0_2px_4px_oklch(0.55_0.12_285/0.08),0_16px_40px_-18px_oklch(0.55_0.12_285/0.35)]">
      <div className="flex flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{node.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {node.kind === 'local'
                  ? 'This machine'
                  : `${node.ssh?.username}@${node.ssh?.host}:${node.ssh?.port}`}
              </span>
            </div>
          </div>
          <StatusBadge meta={headline} dot />
        </div>

        {/* Facts */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {node.os && (
            <span>
              {node.os}/{node.arch}
            </span>
          )}
          {node.cloudflaredVersion && <span>cloudflared {node.cloudflaredVersion}</span>}
          {provisioned && (
            <span className="flex items-center gap-1">
              <Cable className="size-3.5" /> {node.connectionCount ?? 0} conn
            </span>
          )}
          <span>
            {routeCount} route{routeCount === 1 ? '' : 's'}
          </span>
          {node.lastSeenAt && (
            <span className="text-muted-foreground/70">seen {relativeTime(node.lastSeenAt)}</span>
          )}
        </div>

        {/* Provisioned status row */}
        {provisioned && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Tunnel</span>
              <StatusBadge meta={tunnelStatusMeta(node.tunnelStatus)} dot />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Connector</span>
              <StatusBadge meta={connectorStateMeta(node.connectorRunState)} dot />
            </div>
            {!node.serviceInstalled && <Badge variant="warning">background (no service)</Badge>}
          </div>
        )}

        {/* Progress / errors */}
        {isProvisioning && progress && !progress.done && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Spinner className="size-4" />
            {progress.message}
          </div>
        )}
        {isProvisioning && !progress && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Spinner className="size-4" /> Provisioning…
          </div>
        )}
        {node.lastError && node.provisionState === 'error' && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {node.lastError}
          </div>
        )}
        {testResult && <div className="text-sm text-muted-foreground">{testResult}</div>}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {!provisioned && (
            <>
              {node.kind === 'ssh' && (
                <>
                  <Button size="sm" variant="outline" onClick={runTest} loading={m.test.isPending}>
                    {!m.test.isPending && <Terminal className="size-3.5" />}
                    Test
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBootstrapOpen(true)}>
                    <KeyRound className="size-3.5" />
                    Passwordless SSH
                  </Button>
                </>
              )}
              <Button
                size="sm"
                loading={isProvisioning}
                onClick={() => m.provision.mutate({ id: node.id, input: { installService: true } })}
              >
                {!isProvisioning && <Rocket className="size-3.5" />}
                {node.provisionState === 'error' ? 'Retry provision' : 'Provision'}
              </Button>
            </>
          )}

          {provisioned && (
            <>
              <Button size="sm" onClick={() => onAddRoute(node.id)}>
                <Plus className="size-3.5" />
                Add route
              </Button>
              {node.connectorRunState === 'running' ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={m.connector.isPending}
                  onClick={() => m.connector.mutate({ id: node.id, action: 'stop' })}
                >
                  {!m.connector.isPending && <Square className="size-3.5" />}
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  loading={m.connector.isPending}
                  onClick={() => m.connector.mutate({ id: node.id, action: 'start' })}
                >
                  {!m.connector.isPending && <Play className="size-3.5" />}
                  Start
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => m.connector.mutate({ id: node.id, action: 'restart' })}
                title="Restart connector"
              >
                <RotateCw className="size-3.5" />
              </Button>
            </>
          )}

          <Button
            size="icon-sm"
            variant="ghost"
            loading={m.refresh.isPending}
            onClick={() => m.refresh.mutate(node.id)}
            title="Refresh status"
          >
            {!m.refresh.isPending && <RefreshCw className="size-3.5" />}
          </Button>
          <div className="grow" />
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            title="Remove node"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <BootstrapDialog
        nodeId={node.id}
        nodeName={node.name}
        open={bootstrapOpen}
        onClose={() => setBootstrapOpen(false)}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove node?</DialogTitle>
            <DialogDescription>
              This deletes the Cloudflare tunnel for <b className="text-foreground">{node.name}</b>,
              removes its routes and DNS records, and stops the connector. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={m.remove.isPending}
              onClick={() => m.remove.mutate(node.id, { onSuccess: () => setConfirmDelete(false) })}
            >
              Remove node
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function BootstrapDialog({
  nodeId,
  nodeName,
  open,
  onClose,
}: {
  nodeId: string;
  nodeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const { bootstrap } = useNodeMutations();

  const run = () =>
    bootstrap.mutate(
      { id: nodeId, input: { password, useManagedKey: true } },
      {
        onSuccess: () => {
          setPassword('');
          onClose();
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set up passwordless SSH</DialogTitle>
          <DialogDescription>
            puente will generate a dedicated ed25519 key and install it on{' '}
            <b className="text-foreground">{nodeName}</b>. Your password is used once and never
            stored.
          </DialogDescription>
        </DialogHeader>
        <Field label="SSH password (one time)" htmlFor="ssh-password">
          <Input
            id="ssh-password"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password) run();
            }}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={bootstrap.isPending} disabled={!password} onClick={run}>
            Configure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
