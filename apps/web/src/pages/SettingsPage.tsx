import { useState } from 'react';
import { Cloud, RefreshCw, Unplug } from 'lucide-react';
import {
  useCloudflareConnection,
  useCloudflareMutations,
  useSettings,
  useUpdateSettings,
  useZones,
} from '../lib/hooks';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Field } from '../components/ui/extras';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { ConnectCloudflare } from '../components/ConnectCloudflare';

const NONE = '__none__';

export function SettingsPage() {
  const cf = useCloudflareConnection();
  const settings = useSettings();
  const zones = useZones();
  const { disconnect, refreshZones } = useCloudflareMutations();
  const updateSettings = useUpdateSettings();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [poll, setPoll] = useState<string | null>(null);
  const [defaultZone, setDefaultZone] = useState<string | null>(null);

  const connected = cf.data?.connected ?? false;
  const s = settings.data;
  const pollValue = poll ?? String(s?.healthPollSeconds ?? 30);
  const zoneValue = defaultZone ?? s?.defaultZoneId ?? '';
  const zoneList = zones.data ?? [];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-6 sm:px-7">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cloudflare connection, preferences and about.
        </p>
      </header>

      {/* Cloudflare */}
      <Card className="mb-6 gap-0 py-0">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <span className="flex items-center gap-2 font-semibold">
            <Cloud className="size-4" /> Cloudflare
          </span>
          {connected && <Badge variant="success">Connected</Badge>}
        </div>
        <div className="p-5">
          {connected ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <span className="font-semibold">{cf.data?.account?.name}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground">Domains</span>
                  <span className="font-semibold">{cf.data?.zones.length ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={refreshZones.isPending}
                    onClick={() => refreshZones.mutate()}
                  >
                    {!refreshZones.isPending && <RefreshCw className="size-3.5" />}
                    Refresh zones
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDisconnect(true)}
                  >
                    <Unplug className="size-3.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {zoneList.map((z) => (
                  <Badge key={z.id} variant="muted">
                    {z.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <ConnectCloudflare />
          )}
        </div>
      </Card>

      {/* Preferences */}
      <Card className="mb-6 gap-0 py-0">
        <div className="border-b px-5 py-4">
          <span className="font-semibold">Preferences</span>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Health poll interval (seconds)"
              hint="How often tunnel status is refreshed."
              htmlFor="poll"
            >
              <Input
                id="poll"
                type="number"
                min={10}
                max={3600}
                value={pollValue}
                onChange={(e) => setPoll(e.target.value)}
              />
            </Field>
            <Field label="Default domain for new routes">
              <Select
                value={zoneValue === '' ? NONE : zoneValue}
                onValueChange={(v) => setDefaultZone(v === NONE ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {zoneList.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Button
            className="w-fit"
            loading={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({
                healthPollSeconds: Math.min(Math.max(Number(pollValue) || 30, 10), 3600),
                defaultZoneId: zoneValue || null,
              })
            }
          >
            Save preferences
          </Button>
        </div>
      </Card>

      {/* About */}
      <Card className="gap-0 py-0">
        <div className="border-b px-5 py-4">
          <span className="font-semibold">About</span>
        </div>
        <div className="flex flex-col gap-2 p-5 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Version</span>
            <span className="font-mono">{settings.data ? 'v0.1.0' : '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>Data directory</span>
            <span className="truncate font-mono" style={{ maxWidth: 340 }}>
              {s?.dataDir ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Secrets</span>
            <span>Encrypted at rest (AES-256-GCM)</span>
          </div>
        </div>
      </Card>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Cloudflare?</DialogTitle>
            <DialogDescription>
              The stored API token will be removed. Your tunnels and DNS records stay intact on
              Cloudflare, but puente won’t be able to manage them until you reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, { onSuccess: () => setConfirmDisconnect(false) })
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
