import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Cloud,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
  Waypoints,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLive } from '../lib/live';
import { useNodes, useRoutes } from '../lib/hooks';
import { ThemeToggle } from './theme';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/nodes', label: 'Nodes', icon: Server, key: 'nodes' },
  { to: '/routes', label: 'Routes', icon: Waypoints, key: 'routes' },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

const SECTION_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/nodes': 'Nodes',
  '/routes': 'Routes',
  '/activity': 'Activity',
  '/settings': 'Settings',
};

export function Shell() {
  const { user, logout } = useAuth();
  const { connected } = useLive();
  const nodes = useNodes();
  const routes = useRoutes();
  const location = useLocation();
  const title = SECTION_TITLES[location.pathname] ?? 'puente';

  const counts: Record<string, number | undefined> = {
    nodes: nodes.data?.length,
    routes: routes.data?.length,
  };

  const initials = (user?.username ?? 'A').slice(0, 2).toUpperCase();

  return (
    <div className="h-screen p-2.5 sm:p-3">
      <div className="grid h-full grid-cols-1 overflow-hidden rounded-[1.75rem] border border-panel-border bg-panel shadow-[0_24px_70px_-30px_oklch(0.45_0.12_285/0.5)] backdrop-blur-2xl md:grid-cols-[248px_1fr]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-1 border-r border-panel-border/70 p-4 md:flex">
          <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30">
              <Cloud className="size-5" />
            </span>
            <span className="text-[1.05rem] font-bold tracking-tight">puente</span>
          </div>

          <p className="px-3 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Overview
          </p>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const count = 'key' in item ? counts[item.key] : undefined;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-elevated text-foreground shadow-sm ring-1 ring-border/70'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'size-[18px] shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      />
                      <span>{item.label}</span>
                      {count != null && count > 0 && (
                        <span
                          className={cn(
                            'ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                            isActive ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm">
            {connected ? (
              <Wifi className="size-4 text-success" />
            ) : (
              <WifiOff className="size-4 text-muted-foreground" />
            )}
            <span className={cn('font-medium', connected ? 'text-foreground' : 'text-muted-foreground')}>
              {connected ? 'Live' : 'Offline'}
            </span>
            <span
              className={cn(
                'ml-auto size-2 rounded-full',
                connected ? 'bg-success animate-pulse' : 'bg-muted-foreground/50',
              )}
            />
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-panel-border/70 bg-panel/80 px-5 py-3 backdrop-blur-xl sm:px-7">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <div className="flex-1" />
            <ThemeToggle />
            <div className="flex items-center gap-3 pl-1">
              <div className="hidden flex-col items-end leading-tight sm:flex">
                <span className="text-sm font-semibold">{user?.username}</span>
                <span className="text-[11px] text-muted-foreground">admin</span>
              </div>
              <Avatar className="size-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-muted-foreground"
                title="Sign out"
                onClick={logout}
              >
                <LogOut />
                <span className="sr-only">Sign out</span>
              </Button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
