import { ALERT_COOLDOWN_MINUTES, type AlertPayload, type AlertTrigger } from '@puente/shared';
import type { HealthChangedFact } from '../../common/facts';

const MINUTE_MS = 60_000;

/**
 * States that mean "this is broken". `inactive` is deliberately absent: a tunnel sits inactive
 * between being created and its connector starting, and again whenever someone stops the connector
 * on purpose from the panel. Paging a human because they did what they asked for is how alerting
 * gets muted, and a muted alert is worse than none.
 */
const NODE_BAD = new Set(['down', 'degraded']);
const NODE_GOOD = 'healthy';
const ROUTE_BAD = 'unhealthy';
const ROUTE_GOOD = 'healthy';

/**
 * Which alert, if any, a state transition deserves. Pure — the dispatcher owns I/O and clocks,
 * this owns the judgement, so every edge can be tested without a tunnel or a webhook.
 */
export function classify(fact: HealthChangedFact): AlertTrigger | null {
  const { subject, from, to } = fact;
  // No previous reading means no transition: the first sight of a node is not an incident.
  if (from === null) return null;

  if (subject === 'node') {
    if (from === NODE_GOOD && NODE_BAD.has(to)) return 'node.down';
    if (NODE_BAD.has(from) && to === NODE_GOOD) return 'node.up';
    return null;
  }

  if (from === ROUTE_GOOD && to === ROUTE_BAD) return 'route.down';
  if (from === ROUTE_BAD && to === ROUTE_GOOD) return 'route.up';
  return null;
}

export function severityOf(trigger: AlertTrigger): 'critical' | 'ok' {
  return trigger.endsWith('.down') ? 'critical' : 'ok';
}

/** The one-liner a human reads on their phone. Same text for every channel kind. */
export function describe(fact: HealthChangedFact, trigger: AlertTrigger): string {
  const what = fact.subject === 'node' ? 'Node' : 'Route';
  return severityOf(trigger) === 'critical'
    ? `${what} ${fact.name} is ${fact.to} (was ${fact.from})`
    : `${what} ${fact.name} recovered — back to ${fact.to}`;
}

export function buildPayload(fact: HealthChangedFact, trigger: AlertTrigger): AlertPayload {
  return {
    v: 1,
    trigger,
    text: describe(fact, trigger),
    severity: severityOf(trigger),
    subject: { kind: fact.subject, id: fact.id, name: fact.name },
    from: fact.from,
    to: fact.to,
    at: new Date(fact.at).toISOString(),
  };
}

/**
 * True while a channel should stay quiet about this subject. Recoveries ignore the cooldown —
 * an all-clear that arrives ten minutes late is useless, and it can only follow an alert that
 * was already sent.
 */
export function inCooldown(
  trigger: AlertTrigger,
  lastNotifiedAt: number | null,
  now: number,
  minutes = ALERT_COOLDOWN_MINUTES,
): boolean {
  if (severityOf(trigger) === 'ok') return false;
  if (lastNotifiedAt === null) return false;
  return now - lastNotifiedAt < minutes * MINUTE_MS;
}
