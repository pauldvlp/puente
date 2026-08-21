import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  ActivateLicenseInput,
  EventQueryInput,
  UpdateBackupScheduleInput,
  CreateTeamMemberInput,
  UpdateTeamMemberInput,
  CreateAlertChannelInput,
  CreateWorkspaceInput,
  UpdateAlertChannelInput,
  UpdateWorkspaceInput,
  CreateNodeInput,
  CreateRouteInput,
  ProvisionNodeInput,
  SshBootstrapInput,
  UpdateRouteInput,
  UpdateSettingsInput,
} from '@puente/shared';
import { api, ApiError } from './api';
import { qk, queryClient } from './query';
import { setWorkspaceId } from './workspace';

export const errMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);

const notifyError = (e: unknown) => toast.error(errMessage(e));

// --- Queries ---------------------------------------------------------------

export const useSetupStatus = () =>
  useQuery({ queryKey: qk.setup, queryFn: api.setup.status, staleTime: 2000 });

export const useNodes = () => useQuery({ queryKey: qk.nodes, queryFn: api.nodes.list });

export const useRoutes = () => useQuery({ queryKey: qk.routes, queryFn: api.routes.list });

export const useZones = () => useQuery({ queryKey: qk.zones, queryFn: api.cloudflare.zones });

export const useCloudflareConnection = () =>
  useQuery({ queryKey: qk.cfConnection, queryFn: api.cloudflare.connection });

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings.get });

export const useEvents = (filters: EventQueryInput = {}) =>
  useQuery({
    queryKey: [...qk.events, filters],
    queryFn: () => api.events.list(filters),
    refetchInterval: 20000,
  });

/** Current edition. Cached hard: a license changes when someone pastes a key, not on its own. */
export const useLicense = () =>
  useQuery({ queryKey: qk.license, queryFn: api.license.get, staleTime: 60_000 });

export const useBackupSchedule = (enabled: boolean) =>
  useQuery({ queryKey: qk.backupSchedule, queryFn: api.backups.schedule, enabled });

export const useBackupFiles = (enabled: boolean) =>
  useQuery({ queryKey: qk.backupFiles, queryFn: api.backups.files, enabled });

export function useBackupMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.backupSchedule });
    qc.invalidateQueries({ queryKey: qk.backupFiles });
  };

  const update = useMutation({
    mutationFn: (b: UpdateBackupScheduleInput) => api.backups.update(b),
    onSuccess: invalidate,
    onError: notifyError,
  });

  const run = useMutation({
    mutationFn: () => api.backups.run(),
    onSuccess: (file) => {
      invalidate();
      toast.success(`Backup written — ${file.name}`);
    },
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.backups.remove(name),
    onSuccess: () => {
      invalidate();
      toast.success('Backup deleted');
    },
    onError: notifyError,
  });

  return { update, run, remove };
}

export const useTeam = () => useQuery({ queryKey: qk.team, queryFn: api.team.list });

export function useTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.team });

  const create = useMutation({
    mutationFn: (b: CreateTeamMemberInput) => api.team.create(b),
    onSuccess: (m) => {
      invalidate();
      toast.success(`${m.username} can now sign in`);
    },
    onError: notifyError,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeamMemberInput }) =>
      api.team.update(id, body),
    onSuccess: invalidate,
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.team.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Account removed');
    },
    onError: notifyError,
  });

  return { create, update, remove };
}

export const useWorkspaces = () =>
  useQuery({ queryKey: qk.workspaces, queryFn: api.workspaces.list, staleTime: 30_000 });

/**
 * Switching workspace changes what every other query means, so the cache is thrown away rather
 * than invalidated — showing one client's nodes under another client's name, even for a frame,
 * is the one thing this feature must never do.
 */
export function useSwitchWorkspace() {
  return (id: string) => {
    setWorkspaceId(id);
    queryClient.clear();
  };
}

export function useWorkspaceMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.workspaces });

  const create = useMutation({
    mutationFn: (b: CreateWorkspaceInput) => api.workspaces.create(b),
    onSuccess: (ws) => {
      invalidate();
      toast.success(`Workspace "${ws.name}" created`);
    },
    onError: notifyError,
  });

  const rename = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateWorkspaceInput }) =>
      api.workspaces.rename(id, body),
    onSuccess: invalidate,
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.workspaces.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Workspace removed');
    },
    onError: notifyError,
  });

  return { create, rename, remove };
}

/** Alert channels. Pro-only: the endpoint 403s on Community, so this only runs when unlocked. */
export const useAlertChannels = (enabled: boolean) =>
  useQuery({ queryKey: qk.alertChannels, queryFn: api.alerts.list, enabled });

export function useAlertMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.alertChannels });

  const create = useMutation({
    mutationFn: (b: CreateAlertChannelInput) => api.alerts.create(b),
    onSuccess: () => {
      invalidate();
      toast.success('Alert channel added');
    },
    onError: notifyError,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAlertChannelInput }) =>
      api.alerts.update(id, body),
    onSuccess: invalidate,
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.alerts.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Alert channel removed');
    },
    onError: notifyError,
  });

  const test = useMutation({
    mutationFn: (id: string) => api.alerts.test(id),
    onSuccess: (delivery) => {
      invalidate();
      if (delivery.ok) toast.success('Test alert delivered');
      else toast.error(delivery.message);
    },
    onError: notifyError,
  });

  return { create, update, remove, test };
}

export function useLicenseMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.license });

  const activate = useMutation({
    mutationFn: (b: ActivateLicenseInput) => api.license.activate(b),
    onSuccess: (status) => {
      invalidate();
      toast.success(`puente Pro activated for ${status.licensee}`);
    },
    onError: notifyError,
  });

  const deactivate = useMutation({
    mutationFn: () => api.license.deactivate(),
    onSuccess: () => {
      invalidate();
      toast.success('License removed — running as Community');
    },
    onError: notifyError,
  });

  return { activate, deactivate };
}

// --- Node mutations --------------------------------------------------------

export function useNodeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.nodes });

  const create = useMutation({
    mutationFn: (b: CreateNodeInput) => api.nodes.create(b),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: qk.setup });
      toast.success('Node added');
    },
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.nodes.remove(id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: qk.routes });
      toast.success('Node removed');
    },
    onError: notifyError,
  });

  const test = useMutation({
    mutationFn: (id: string) => api.nodes.test(id),
    onSuccess: () => invalidate(),
    onError: notifyError,
  });

  const bootstrap = useMutation({
    mutationFn: (v: { id: string; input: SshBootstrapInput }) => api.nodes.bootstrap(v.id, v.input),
    onSuccess: () => {
      invalidate();
      toast.success('Passwordless SSH configured');
    },
    onError: notifyError,
  });

  const provision = useMutation({
    mutationFn: (v: { id: string; input: ProvisionNodeInput }) =>
      api.nodes.provision(v.id, v.input),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: qk.setup });
      toast.success('Node provisioned');
    },
    onError: notifyError,
  });

  const connector = useMutation({
    mutationFn: (v: { id: string; action: 'start' | 'stop' | 'restart' }) =>
      api.nodes.connector(v.id, v.action),
    onSuccess: () => invalidate(),
    onError: notifyError,
  });

  const refresh = useMutation({
    mutationFn: (id: string) => api.nodes.refresh(id),
    onSuccess: () => invalidate(),
    onError: notifyError,
  });

  return { create, remove, test, bootstrap, provision, connector, refresh };
}

// --- Route mutations -------------------------------------------------------

export function useRouteMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.routes });

  const create = useMutation({
    mutationFn: (b: CreateRouteInput) => api.routes.create(b),
    onSuccess: (r) => {
      invalidate();
      toast.success(`Published ${r.hostname}`);
    },
    onError: notifyError,
  });

  const update = useMutation({
    mutationFn: (v: { id: string; input: UpdateRouteInput }) => api.routes.update(v.id, v.input),
    onSuccess: () => invalidate(),
    onError: notifyError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.routes.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Route removed');
    },
    onError: notifyError,
  });

  const check = useMutation({
    mutationFn: (id: string) => api.routes.check(id),
    onSuccess: () => invalidate(),
    onError: notifyError,
  });

  return { create, update, remove, check };
}

// --- Cloudflare / settings -------------------------------------------------

export function useCloudflareMutations() {
  const qc = useQueryClient();
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: qk.cfConnection });
    qc.invalidateQueries({ queryKey: qk.zones });
    qc.invalidateQueries({ queryKey: qk.setup });
    qc.invalidateQueries({ queryKey: qk.settings });
  };

  const connect = useMutation({
    mutationFn: (v: { apiToken: string; accountId?: string }) =>
      api.cloudflare.connect(v.apiToken, v.accountId),
    onSuccess: () => {
      refreshAll();
      toast.success('Cloudflare connected');
    },
    onError: notifyError,
  });

  const disconnect = useMutation({
    mutationFn: () => api.cloudflare.disconnect(),
    onSuccess: () => {
      refreshAll();
      toast.success('Cloudflare disconnected');
    },
    onError: notifyError,
  });

  const refreshZones = useMutation({
    mutationFn: () => api.cloudflare.refreshZones(),
    onSuccess: () => {
      refreshAll();
      toast.success('Zones refreshed');
    },
    onError: notifyError,
  });

  return { connect, disconnect, refreshZones };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateSettingsInput) => api.settings.update(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings });
      toast.success('Settings saved');
    },
    onError: notifyError,
  });
}
