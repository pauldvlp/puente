import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CreateNodeInput,
  CreateRouteInput,
  ProvisionNodeInput,
  SshBootstrapInput,
  UpdateRouteInput,
  UpdateSettingsInput,
} from '@puente/shared';
import { api, ApiError } from './api';
import { qk } from './query';

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

export const useEvents = () =>
  useQuery({ queryKey: qk.events, queryFn: api.events.list, refetchInterval: 20000 });

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
    mutationFn: (v: { id: string; input: ProvisionNodeInput }) => api.nodes.provision(v.id, v.input),
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
