/**
 * Human time, in both directions.
 *
 * This used to assume every timestamp was in the past — a negative difference fell through to
 * "just now", so a backup scheduled for next Wednesday was announced as happening this instant.
 */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '—';

  const diff = now - target;
  const future = diff < 0;
  const s = Math.round(Math.abs(diff) / 1000);

  if (s < 5) return future ? 'in a moment' : 'just now';
  if (s < 60) return future ? `in ${s}s` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return future ? `in ${d}d` : `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
