import {
  API_PREFIX,
  type ActivityEvent,
  type AppSettings,
  type AuthToken,
  type CloudflareConnection,
  type CloudflareZone,
  type CreateNodeInput,
  type CreateRouteInput,
  type LoginInput,
  type Node as PuenteNode,
  type ProvisionNodeInput,
  type RegisterAdminInput,
  type Route as PuenteRoute,
  type RouteCheckResult,
  type SessionUser,
  type SetupStatus,
  type SshBootstrapInput,
  type SshConfigHost,
  type SshKey,
  type SshTestResult,
  type UpdateRouteInput,
  type UpdateSettingsInput,
} from '@puente/shared';

const TOKEN_KEY = 'puente_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the puente server.');
  }

  if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/setup')) {
    clearToken();
  }

  if (!res.ok) {
    let payload: { message?: string | string[]; code?: string } = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error */
    }
    const rawMsg = payload.message;
    const message = Array.isArray(rawMsg)
      ? rawMsg.join('\n')
      : rawMsg || `Request failed (${res.status})`;
    throw new ApiError(
      res.status,
      message,
      payload.code,
      Array.isArray(rawMsg) ? rawMsg : undefined,
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b);
const patch = <T>(p: string, b?: unknown) => request<T>('PATCH', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

export interface VerifyTokenResult {
  status: 'active' | 'disabled' | 'expired' | 'unknown';
  accounts: { id: string; name: string; type?: string }[];
  zones: CloudflareZone[];
}
export interface ScopeItem {
  category: string;
  group: string;
  access: string;
  reason: string;
}

export const api = {
  setup: {
    status: () => get<SetupStatus>('/setup/status'),
  },
  auth: {
    register: (b: RegisterAdminInput) => post<AuthToken>('/auth/register', b),
    login: (b: LoginInput) => post<AuthToken>('/auth/login', b),
    me: () => get<SessionUser>('/auth/me'),
  },
  cloudflare: {
    verify: (apiToken: string) => post<VerifyTokenResult>('/cloudflare/verify', { apiToken }),
    connect: (apiToken: string, accountId?: string) =>
      post<CloudflareConnection>('/cloudflare/connect', { apiToken, accountId }),
    connection: () => get<CloudflareConnection>('/cloudflare/connection'),
    disconnect: () => post<{ ok: true }>('/cloudflare/disconnect'),
    zones: () => get<CloudflareZone[]>('/cloudflare/zones'),
    refreshZones: () => post<CloudflareZone[]>('/cloudflare/zones/refresh'),
    scopes: () => get<{ scopes: ScopeItem[] }>('/cloudflare/scopes'),
  },
  settings: {
    get: () => get<AppSettings>('/settings'),
    update: (b: UpdateSettingsInput) => patch<AppSettings>('/settings', b),
  },
  nodes: {
    list: () => get<PuenteNode[]>('/nodes'),
    get: (id: string) => get<PuenteNode>(`/nodes/${id}`),
    create: (b: CreateNodeInput) => post<PuenteNode>('/nodes', b),
    remove: (id: string) => del<{ ok: true }>(`/nodes/${id}`),
    test: (id: string) => post<SshTestResult>(`/nodes/${id}/test`),
    bootstrap: (id: string, b: SshBootstrapInput) =>
      post<SshTestResult>(`/nodes/${id}/bootstrap`, b),
    provision: (id: string, b: ProvisionNodeInput) => post<PuenteNode>(`/nodes/${id}/provision`, b),
    connector: (id: string, action: 'start' | 'stop' | 'restart') =>
      post<PuenteNode>(`/nodes/${id}/connector/${action}`),
    refresh: (id: string) => post<PuenteNode>(`/nodes/${id}/refresh`),
  },
  routes: {
    list: () => get<PuenteRoute[]>('/routes'),
    create: (b: CreateRouteInput) => post<PuenteRoute>('/routes', b),
    update: (id: string, b: UpdateRouteInput) => patch<PuenteRoute>(`/routes/${id}`, b),
    remove: (id: string) => del<{ ok: true }>(`/routes/${id}`),
    check: (id: string) => post<RouteCheckResult>(`/routes/${id}/check`),
  },
  events: {
    list: () => get<ActivityEvent[]>('/events'),
  },
  ssh: {
    configHosts: () => get<SshConfigHost[]>('/ssh/config-hosts'),
    keys: () => get<SshKey[]>('/ssh/keys'),
  },
};

/** URL for the SSE stream, authenticated via query param (EventSource cannot set headers). */
export function streamUrl(): string {
  const token = getToken();
  return `${API_PREFIX}/stream${token ? `?access_token=${encodeURIComponent(token)}` : ''}`;
}
