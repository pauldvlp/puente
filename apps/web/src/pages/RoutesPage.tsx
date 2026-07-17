import { useMemo, useState } from 'react';
import { ExternalLink, HeartPulse, Plus, Trash2, Waypoints } from 'lucide-react';
import { buildServiceUrl, type Route as PuenteRoute } from '@puente/shared';
import {
  useNodes,
  useRoutes,
  useRouteMutations,
  useZones,
  useCloudflareConnection,
} from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Spinner } from '../components/ui/spinner';
import { EmptyState, StatusBadge } from '../components/ui/extras';
import { routeHealthMeta, routeStatusMeta } from '../lib/status';
import { CreateRouteDialog } from '../components/CreateRouteDialog';
import { cn } from '@/lib/utils';

export function RoutesPage() {
  const routes = useRoutes();
  const nodes = useNodes();
  const zones = useZones();
  const cf = useCloudflareConnection();
  const [open, setOpen] = useState(false);

  const nodeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes.data ?? []) map.set(n.id, n.name);
    return map;
  }, [nodes.data]);

  const provisioned = (nodes.data ?? []).filter((n) => n.tunnelId);
  const canPublish = (cf.data?.connected ?? false) && provisioned.length > 0;
  const routeList = routes.data ?? [];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Routes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public subdomains mapped to local services on your nodes.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!canPublish}>
          <Plus className="size-4" />
          Publish route
        </Button>
      </header>

      {routes.isLoading ? (
        <div className="grid h-60 place-items-center">
          <Spinner className="size-8" />
        </div>
      ) : routeList.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={<Waypoints className="size-6" />}
            title="No routes yet"
            description={
              canPublish
                ? 'Publish a local port on one of your subdomains — e.g. port 7008 → vw.yourdomain.com.'
                : 'Provision a node and connect Cloudflare first, then publish your first route.'
            }
            action={
              canPublish ? (
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4" />
                  Publish your first route
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex flex-col">
            {routeList.map((route, i) => (
              <RouteRow
                key={route.id}
                route={route}
                nodeName={nodeName.get(route.nodeId) ?? '—'}
                last={i === routeList.length - 1}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Mounted only while open so state initializes fresh from loaded data. */}
      {open && (
        <CreateRouteDialog
          open
          onClose={() => setOpen(false)}
          nodes={nodes.data ?? []}
          zones={zones.data ?? []}
        />
      )}
    </div>
  );
}

function RouteRow({
  route,
  nodeName,
  last,
}: {
  route: PuenteRoute;
  nodeName: string;
  last: boolean;
}) {
  const { remove, check } = useRouteMutations();
  const url = `https://${route.hostname}`;

  return (
    <div
      className={cn(
        'flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/40',
        !last && 'border-b',
      )}
    >
      <div className="flex min-w-0 grow flex-col">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          <span className="truncate">{route.hostname}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
        <span className="truncate font-mono text-xs text-muted-foreground">
          → {buildServiceUrl(route.service)}
          {route.path ? `  ·  ${route.path}` : ''}
        </span>
      </div>

      <Badge variant="muted" className="hidden sm:inline-flex">
        {nodeName}
      </Badge>
      <StatusBadge meta={routeStatusMeta(route.status)} dot />
      <StatusBadge meta={routeHealthMeta(route.health)} />

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          loading={check.isPending && check.variables === route.id}
          onClick={() => check.mutate(route.id)}
          title="Check health"
        >
          {!(check.isPending && check.variables === route.id) && (
            <HeartPulse className="size-3.5" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          loading={remove.isPending && remove.variables === route.id}
          onClick={() => remove.mutate(route.id)}
          title="Delete route"
        >
          {!(remove.isPending && remove.variables === route.id) && <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
