import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  CheckCircle2,
  Circle,
  Cloud,
  Plus,
  Server,
  Waypoints,
} from 'lucide-react';
import type { ActivityEvent } from '@puente/shared';
import {
  useCloudflareConnection,
  useEvents,
  useNodes,
  useRoutes,
} from '../lib/hooks';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/extras';
import { ConnectCloudflare } from '../components/ConnectCloudflare';
import { relativeTime } from '../lib/format';
import { nodeHeadlineMeta, type Tone } from '../lib/status';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const cf = useCloudflareConnection();
  const nodes = useNodes();
  const routes = useRoutes();
  const events = useEvents();

  const connected = cf.data?.connected ?? false;
  const nodeList = nodes.data ?? [];
  const routeList = routes.data ?? [];
  const healthyTunnels = nodeList.filter((n) => n.tunnelStatus === 'healthy').length;
  const activeRoutes = routeList.filter((r) => r.status === 'active').length;

  const steps = [
    { label: 'Connect Cloudflare', done: connected },
    { label: 'Add & provision a node', done: nodeList.some((n) => n.provisionState === 'provisioned') },
    { label: 'Publish a route', done: routeList.length > 0 },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cf.data?.account ? `Connected to ${cf.data.account.name}` : 'Your Cloudflare Tunnel control plane'}
        </p>
      </header>

      {/* Onboarding */}
      {!allDone && (
        <Card className="mb-6 gap-0 py-0">
          <div className="flex items-center gap-2.5 border-b px-5 py-4">
            <span className="font-semibold">Get started</span>
            <span className="text-xs text-muted-foreground">
              {steps.filter((s) => s.done).length}/{steps.length} done
            </span>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {steps.map((s) => (
                <span
                  key={s.label}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    s.done ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {s.done ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                  {s.label}
                </span>
              ))}
            </div>

            {!connected ? (
              <div className="mt-2">
                <ConnectCloudflare />
              </div>
            ) : !nodeList.some((n) => n.provisionState === 'provisioned') ? (
              <OnboardingCTA
                icon={<Server className="size-4.5" />}
                title="Add and provision a node"
                desc="Register this machine or a remote server. puente installs cloudflared and creates its tunnel."
                to="/nodes"
                cta="Go to Nodes"
              />
            ) : (
              <OnboardingCTA
                icon={<Waypoints className="size-4.5" />}
                title="Publish your first route"
                desc="Map a local port to a subdomain, e.g. 7008 → vw.yourdomain.com."
                to="/routes"
                cta="Publish a route"
              />
            )}
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={<Server className="size-4" />} label="Nodes" value={nodeList.length} sub={`${healthyTunnels} healthy`} />
        <Stat icon={<Waypoints className="size-4" />} label="Routes" value={routeList.length} sub={`${activeRoutes} active`} />
        <Stat
          icon={<Cloud className="size-4" />}
          label="Cloudflare"
          value={connected ? cf.data?.zones.length ?? 0 : 0}
          sub={connected ? 'domains' : 'not connected'}
          tone={connected ? 'ok' : 'neutral'}
        />
        <Stat
          icon={<ActivityIcon className="size-4" />}
          label="Live tunnels"
          value={healthyTunnels}
          sub={`of ${nodeList.filter((n) => n.tunnelId).length}`}
          tone={healthyTunnels > 0 ? 'ok' : 'neutral'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Nodes overview */}
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <span className="font-semibold">Nodes</span>
            <Button asChild variant="ghost" size="sm">
              <Link to="/nodes">Manage</Link>
            </Button>
          </div>
          <div className="flex flex-col">
            {nodeList.length === 0 ? (
              <div className="p-5">
                <Button asChild variant="outline" size="sm">
                  <Link to="/nodes">
                    <Plus className="size-3.5" /> Add a node
                  </Link>
                </Button>
              </div>
            ) : (
              nodeList.slice(0, 5).map((n, i) => (
                <div
                  key={n.id}
                  className={cn('flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-muted/50', i < Math.min(nodeList.length, 5) - 1 && 'border-b')}
                >
                  <Server className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 grow flex-col">
                    <span className="truncate text-sm font-semibold">{n.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {n.kind === 'local' ? 'local' : n.ssh?.host} · {n.os ?? '—'}
                    </span>
                  </div>
                  <StatusBadge meta={nodeHeadlineMeta(n)} dot />
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <span className="font-semibold">Recent activity</span>
            <Button asChild variant="ghost" size="sm">
              <Link to="/activity">All</Link>
            </Button>
          </div>
          <div className="flex flex-col">
            {(events.data ?? []).slice(0, 6).map((e, i, arr) => (
              <ActivityRow key={e.id} event={e} last={i === arr.length - 1} />
            ))}
            {(events.data ?? []).length === 0 && (
              <div className="p-5 text-sm text-muted-foreground">No activity yet.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

const STAT_TONE: Record<Tone, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  danger: 'text-destructive',
  brand: 'text-primary',
  neutral: 'text-foreground',
};

function Stat({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <Card className="gap-2 p-5">
      <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground [&_svg]:text-muted-foreground/80">
        {icon}
        {label}
      </span>
      <span className={cn('text-[2rem] font-bold leading-none tracking-tight tabular-nums', STAT_TONE[tone])}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Card>
  );
}

function OnboardingCTA({
  icon,
  title,
  desc,
  to,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  to: string;
  cta: string;
}) {
  return (
    <div className="mt-2 flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{desc}</span>
        </div>
      </div>
      <Button asChild size="sm">
        <Link to={to}>{cta}</Link>
      </Button>
    </div>
  );
}

const LEVEL_DOT: Record<ActivityEvent['level'], string> = {
  info: 'bg-muted-foreground/50',
  success: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-destructive',
};

function ActivityRow({ event, last }: { event: ActivityEvent; last: boolean }) {
  return (
    <div className={cn('flex items-center gap-3.5 px-5 py-3', !last && 'border-b')}>
      <span className={cn('size-2 shrink-0 rounded-full', LEVEL_DOT[event.level])} />
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-sm">{event.message}</span>
        <span className="text-xs text-muted-foreground">{relativeTime(event.ts)}</span>
      </div>
    </div>
  );
}
