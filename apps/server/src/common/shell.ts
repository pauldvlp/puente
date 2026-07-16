/** POSIX single-quote escaping so untrusted values are safe inside a shell command. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Map `uname -m` output to the arch slug used by cloudflared release assets. */
export function normalizeArch(unameM: string): string | null {
  const m = unameM.trim().toLowerCase();
  const table: Record<string, string> = {
    x86_64: 'amd64',
    amd64: 'amd64',
    aarch64: 'arm64',
    arm64: 'arm64',
    armv7l: 'arm',
    armv6l: 'arm',
    i386: '386',
    i686: '386',
  };
  return table[m] ?? null;
}

/** Map `uname -s` output to an OS slug. */
export function normalizeOs(unameS: string): 'linux' | 'darwin' | 'unknown' {
  const s = unameS.trim().toLowerCase();
  if (s === 'linux') return 'linux';
  if (s === 'darwin') return 'darwin';
  return 'unknown';
}
