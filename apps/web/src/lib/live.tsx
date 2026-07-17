import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Node as PuenteNode, Route as PuenteRoute, StreamEvent } from '@puente/shared';
import { streamUrl } from './api';
import { qk } from './query';
import { useAuth } from './auth';

export interface ProgressState {
  step: string;
  message: string;
  done: boolean;
  error: boolean;
  at: number;
}

interface LiveContextValue {
  connected: boolean;
  progress: Record<string, ProgressState>;
}

const LiveContext = createContext<LiveContextValue>({ connected: false, progress: {} });

export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});

  useEffect(() => {
    if (!isAuthenticated) return;
    const es = new EventSource(streamUrl());

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(ev.data) as StreamEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case 'hello':
        case 'ping':
          setConnected(true);
          break;
        case 'node.updated':
          upsertNode(qc, event.node);
          break;
        case 'node.deleted':
          qc.setQueryData<PuenteNode[]>(qk.nodes, (old) =>
            old?.filter((n) => n.id !== event.nodeId),
          );
          break;
        case 'route.updated':
          upsertRoute(qc, event.route);
          break;
        case 'route.deleted':
          qc.setQueryData<PuenteRoute[]>(qk.routes, (old) =>
            old?.filter((r) => r.id !== event.routeId),
          );
          break;
        case 'event':
          qc.invalidateQueries({ queryKey: qk.events });
          break;
        case 'progress':
          setProgress((prev) => ({
            ...prev,
            [event.scope]: {
              step: event.step,
              message: event.message,
              done: event.done,
              error: event.error,
              at: Date.now(),
            },
          }));
          break;
      }
    };

    return () => es.close();
  }, [isAuthenticated, qc]);

  return <LiveContext.Provider value={{ connected, progress }}>{children}</LiveContext.Provider>;
}

function upsertNode(qc: ReturnType<typeof useQueryClient>, node: PuenteNode) {
  qc.setQueryData<PuenteNode[]>(qk.nodes, (old) => {
    if (!old) return [node];
    const idx = old.findIndex((n) => n.id === node.id);
    if (idx < 0) return [node, ...old];
    const copy = [...old];
    copy[idx] = node;
    return copy;
  });
  qc.setQueryData(qk.node(node.id), node);
}

function upsertRoute(qc: ReturnType<typeof useQueryClient>, route: PuenteRoute) {
  qc.setQueryData<PuenteRoute[]>(qk.routes, (old) => {
    if (!old) return [route];
    const idx = old.findIndex((r) => r.id === route.id);
    if (idx < 0) return [route, ...old];
    const copy = [...old];
    copy[idx] = route;
    return copy;
  });
}

export const useLive = () => useContext(LiveContext);
export function useProgress(scope: string): ProgressState | undefined {
  return useContext(LiveContext).progress[scope];
}
