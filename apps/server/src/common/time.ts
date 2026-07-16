/** Current epoch millis (how timestamps are stored in SQLite). */
export const nowMs = (): number => Date.now();

/** Convert stored epoch-millis to the ISO string the API contract exposes. */
export const toIso = (ms: number | null | undefined): string | null =>
  ms == null ? null : new Date(ms).toISOString();

/** Non-null ISO for required timestamps. */
export const toIsoStrict = (ms: number): string => new Date(ms).toISOString();
