import { WORKSPACE_HEADER } from '@puente/shared';

const KEY = 'puente_workspace';

/**
 * Which workspace the panel is looking at. Kept in localStorage rather than in React state so the
 * plain `fetch` wrapper can read it without threading a context through every call — the same
 * arrangement the auth token already uses.
 *
 * An unknown or stale id is not a problem: the server falls back to the default workspace, which
 * is what an install with only one has anyway.
 */
export const getWorkspaceId = (): string | null => localStorage.getItem(KEY);

export const setWorkspaceId = (id: string): void => localStorage.setItem(KEY, id);

export const clearWorkspaceId = (): void => localStorage.removeItem(KEY);

export { WORKSPACE_HEADER };
