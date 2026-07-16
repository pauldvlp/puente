import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Activity as ActivityIcon,
  TriangleAlert,
} from 'lucide-react';
import type { ActivityEvent, EventLevel } from '@puente/shared';
import { useEvents } from '../lib/hooks';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';
import { EmptyState } from '../components/ui/extras';
import { absoluteTime, relativeTime } from '../lib/format';

const ICONS: Record<EventLevel, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-muted-foreground' },
  success: { icon: CheckCircle2, className: 'text-success' },
  warn: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: AlertTriangle, className: 'text-destructive' },
};

export function ActivityPage() {
  const events = useEvents();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything puente has done, newest first.</p>
      </header>

      {events.isLoading ? (
        <div className="grid h-60 place-items-center">
          <Spinner className="size-8" />
        </div>
      ) : (events.data ?? []).length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={<ActivityIcon className="size-6" />}
            title="No activity yet"
            description="Actions you take will show up here."
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex flex-col">
            {(events.data ?? []).map((e, i) => (
              <Row key={e.id} event={e} last={i === (events.data ?? []).length - 1} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ event, last }: { event: ActivityEvent; last: boolean }) {
  const { icon: Icon, className } = ICONS[event.level];
  return (
    <div className={`flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/50 ${last ? '' : 'border-b'}`}>
      <Icon className={`size-[17px] shrink-0 ${className}`} />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{event.message}</span>
        <span className="text-xs text-muted-foreground">
          {event.action} · {absoluteTime(event.ts)}
        </span>
      </div>
      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{relativeTime(event.ts)}</span>
    </div>
  );
}
