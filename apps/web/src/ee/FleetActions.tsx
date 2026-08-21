import { useState } from 'react';
import { CircleCheck, CircleX, Layers, RotateCw } from 'lucide-react';
import type { FleetOperation, FleetRun } from '@puente/shared';
import { useFleet, useLicense } from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Spinner } from '../components/ui/spinner';

/**
 * Fleet actions, on the nodes page because that is where someone is when they think "all of
 * these need updating". Absent entirely without the licence: an empty bar with two dead buttons
 * would be worse than not mentioning it.
 */
export function FleetActions({ nodeCount }: { nodeCount: number }) {
  const license = useLicense();
  const fleet = useFleet();
  const [run, setRun] = useState<FleetRun | null>(null);

  const unlocked = license.data?.features.includes('fleet') ?? false;
  if (!unlocked || nodeCount < 2) return null;

  const start = (operation: FleetOperation) => {
    setRun(null);
    fleet.mutate({ operation }, { onSuccess: setRun });
  };

  return (
    <Card className="mb-5 gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Layers className="size-4" /> All {nodeCount} nodes
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => start('upgrade')}
            disabled={fleet.isPending}
          >
            {fleet.isPending ? <Spinner className="size-4" /> : <RotateCw className="size-4" />}
            Update every connector
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => start('restart')}
            disabled={fleet.isPending}
          >
            Restart every connector
          </Button>
        </div>
      </div>

      {fleet.isPending && (
        <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
          One machine at a time, so only one origin is ever unreachable. This takes a while.
        </p>
      )}

      {run && (
        <div className="flex flex-col gap-1.5 border-t px-5 py-3">
          <span className="text-sm font-medium">
            {run.succeeded} succeeded{run.failed > 0 && `, ${run.failed} failed`}
          </span>
          {run.results.map((r) => (
            <span key={r.nodeId} className="flex items-center gap-2 text-xs">
              {r.ok ? (
                <CircleCheck className="size-3.5 text-success" />
              ) : (
                <CircleX className="size-3.5 text-destructive" />
              )}
              <span className="font-medium">{r.name}</span>
              <span className="truncate text-muted-foreground">{r.message}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
