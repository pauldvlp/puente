/**
 * Terminal colour, only where a terminal is watching.
 *
 * Escape codes written to a pipe are noise: they clutter `puente logs`, systemd journals and
 * Docker output, and they corrupt anything that parses the CLI's output — which is how a path
 * printed by `puente restore` came back with `\x1b[0m` stuck to the end of it.
 *
 * Honours NO_COLOR (https://no-color.org) as well.
 */
const enabled = (): boolean => Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const wrap =
  (code: string) =>
  (s: string): string =>
    enabled() ? `\x1b[${code}m${s}\x1b[0m` : s;

export const cyan = wrap('36');
export const green = wrap('32');
export const yellow = wrap('33');
export const red = wrap('31');
export const dim = wrap('2');
export const bold = wrap('1');
