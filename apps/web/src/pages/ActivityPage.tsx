import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Activity as ActivityIcon,
  Lock,
  TriangleAlert,
} from 'lucide-react';
import {
  UPGRADE_URL,
  type ActivityEvent,
  type EventLevel,
  type EventQueryInput,
} from '@puente/shared';
import { useEvents, useLicense } from '../lib/hooks';
import { api, getToken } from '../lib/api';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Spinner } from '../components/ui/spinner';
import { EmptyState } from '../components/ui/extras';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { absoluteTime, relativeTime } from '../lib/format';

const ICONS: Record<EventLevel, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-muted-foreground' },
  success: { icon: CheckCircle2, className: 'text-success' },
  warn: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: AlertTriangle, className: 'text-destructive' },
};

const ANY_LEVEL = '__any__';

export function ActivityPage() {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string>(ANY_LEVEL);
  const filters: EventQueryInput = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(level !== ANY_LEVEL ? { level: level as EventLevel } : {}),
  };
  const events = useEvents(filters);
  const license = useLicense();
  const canExport = license.data?.features.includes('audit') ?? false;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything puente has done, and who asked for it. Newest first.
          </p>
        </div>
        {canExport ? (
          <Button variant="outline" onClick={() => downloadExport(filters)}>
            <Download className="size-4" /> Export CSV
          </Button>
        ) : (
          <a
            href={UPGRADE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
            title="Exporting the audit trail is a puente Pro capability"
          >
            <Lock className="size-3.5" /> Export is a Pro feature
          </a>
        )}
      </header>

      {/* Searching is free: a log you cannot search is not a log. */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages…"
          aria-label="Search activity"
          className="max-w-xs"
        />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-[10rem]" aria-label="Level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_LEVEL}>Any level</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {events.isLoading ? (
        <div className="grid h-60 place-items-center">
          <Spinner className="size-8" />
        </div>
      ) : (events.data ?? []).length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={<ActivityIcon className="size-6" />}
            title={search || level !== ANY_LEVEL ? 'Nothing matches' : 'No activity yet'}
            description={
              search || level !== ANY_LEVEL
                ? 'Try a different search, or clear the filters.'
                : 'Actions you take will show up here.'
            }
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
    <div
      className={`flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/50 ${last ? '' : 'border-b'}`}
    >
      <Icon className={`size-[17px] shrink-0 ${className}`} />
      <div className="flex min-w-0 flex-col">
        <span className="text-sm">{event.message}</span>
        <span className="text-xs text-muted-foreground">
          {event.action} · {absoluteTime(event.ts)}
          {event.username && <> · by {event.username}</>}
        </span>
      </div>
      <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
        {relativeTime(event.ts)}
      </span>
    </div>
  );
}

/**
 * The export endpoint needs the bearer token, so it cannot simply be a link. Fetch it, then hand
 * the blob to the browser as a download.
 */
async function downloadExport(filters: EventQueryInput): Promise<void> {
  const res = await fetch(api.audit.exportUrl(filters, 'csv'), {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `puente-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
