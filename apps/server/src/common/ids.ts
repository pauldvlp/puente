import { randomUUID } from 'node:crypto';

/** Short, URL-safe id with an optional semantic prefix (e.g. `node_ab12…`). */
export function newId(prefix?: string): string {
  const raw = randomUUID().replace(/-/g, '').slice(0, 20);
  return prefix ? `${prefix}_${raw}` : raw;
}
