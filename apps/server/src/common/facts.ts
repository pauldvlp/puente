/**
 * Internal domain facts, published on the {@link EventBus} for anything in-process that cares.
 *
 * Deliberately separate from `StreamEvent`: those are pushed to browsers over SSE, these are not.
 * The split is also what keeps the licensing boundary honest — the AGPL core announces what
 * happened and never imports `ee/`, while paid features subscribe from the other side.
 */
export interface HealthChangedFact {
  type: 'health.changed';
  subject: 'node' | 'route';
  id: string;
  name: string;
  /** Previous state in puente's own vocabulary (tunnel status / route health). Null on first sight. */
  from: string | null;
  to: string;
  at: number;
}

export type DomainFact = HealthChangedFact;
