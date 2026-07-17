import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Server } from 'lucide-react';
import { useNodes, useRoutes, useZones, useCloudflareConnection } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';
import { EmptyState } from '../components/ui/extras';
import { NodeCard } from '../components/NodeCard';
import { AddNodeDialog } from '../components/AddNodeDialog';
import { CreateRouteDialog } from '../components/CreateRouteDialog';

export function NodesPage() {
  const nodes = useNodes();
  const routes = useRoutes();
  const zones = useZones();
  const cf = useCloudflareConnection();
  const [addOpen, setAddOpen] = useState(false);
  const [routeNodeId, setRouteNodeId] = useState<string | null>(null);

  const routeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of routes.data ?? []) map.set(r.nodeId, (map.get(r.nodeId) ?? 0) + 1);
    return map;
  }, [routes.data]);

  const hasLocal = (nodes.data ?? []).some((n) => n.kind === 'local');
  const cfConnected = cf.data?.connected ?? false;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nodes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Machines running a Cloudflare Tunnel connector.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" />
          Add node
        </Button>
      </header>

      {!cfConnected && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-warning/12 px-4 py-3">
          <span className="text-sm font-semibold text-warning">
            Connect Cloudflare before provisioning nodes.
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings">Go to Settings</Link>
          </Button>
        </div>
      )}

      {nodes.isLoading ? (
        <div className="grid h-60 place-items-center">
          <Spinner className="size-8" />
        </div>
      ) : (nodes.data ?? []).length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={<Server className="size-6" />}
            title="No nodes yet"
            description="Add this machine or a remote server over SSH to start publishing local services on your domains."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" />
                Add your first node
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(nodes.data ?? []).map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              routeCount={routeCounts.get(node.id) ?? 0}
              onAddRoute={(id) => setRouteNodeId(id)}
            />
          ))}
        </div>
      )}

      {/* Mounted only while open so state initializes fresh from loaded data + props. */}
      {addOpen && <AddNodeDialog open onClose={() => setAddOpen(false)} hasLocal={hasLocal} />}
      {routeNodeId !== null && (
        <CreateRouteDialog
          open
          onClose={() => setRouteNodeId(null)}
          nodes={nodes.data ?? []}
          zones={zones.data ?? []}
          defaultNodeId={routeNodeId}
        />
      )}
    </div>
  );
}
