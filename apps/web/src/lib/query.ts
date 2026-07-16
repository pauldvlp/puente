import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

export const qk = {
  setup: ['setup'] as const,
  nodes: ['nodes'] as const,
  node: (id: string) => ['nodes', id] as const,
  routes: ['routes'] as const,
  zones: ['zones'] as const,
  cfConnection: ['cf-connection'] as const,
  settings: ['settings'] as const,
  events: ['events'] as const,
  sshHosts: ['ssh-hosts'] as const,
};
