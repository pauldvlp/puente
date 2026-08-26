import { describe, expect, it } from 'vitest';
import { CloudflaredService, type Target } from './cloudflared.service';
import { LocalExecutor, type CommandExecutor, type ExecResult } from '../../common/executor';

/**
 * The bug this guards against: every `pgrep -f` / `pkill -f` here matched the shell that
 * carried it. `-f` compares whole command lines, and the command line of the
 * `bash -lc "<script>"` running the check contains the script — the pattern with it.
 *
 * Two failures came out of that, both seen on a real node. The run-state check answered
 * "running" on a machine with no cloudflared at all, so the dashboard held a green
 * "Connector · Running" beside a tunnel that was down with zero connections. And the
 * no-sudo start path opened with `pkill -f '<cmd> tunnel run'`, which killed the very
 * shell that was about to `nohup` the connector — it could never start anything.
 *
 * The tests run real shells, because the failure only exists once a pattern sits inside a
 * command line. Each is paired with the shapes that do fail, so no regression can pass by
 * making an assertion vacuous — including the bracket trick, which looks like the fix and
 * is not one.
 */

/** A name nothing on any machine is running, so only self-matching can find it. */
const ABSENT = 'puente-connector-spec-absent';

/** How the service asks; parameterised by process name so a test can aim it at nothing. */
function pidProbe(name: string): string {
  return (
    `probe() { for p in $(pgrep -x ${name} 2>/dev/null); do ` +
    `case "$(ps -o args= -p "$p" 2>/dev/null)" in *"tunnel run"*) echo "$p";; esac; done; }; ` +
    `if [ -n "$(probe)" ]; then echo active; else echo inactive; fi`
  );
}

class FakeExecutor implements CommandExecutor {
  readonly kind = 'local' as const;
  readonly commands: string[] = [];
  constructor(private readonly reply: (cmd: string) => Partial<ExecResult>) {}
  exec(command: string): Promise<ExecResult> {
    this.commands.push(command);
    return Promise.resolve({ code: 0, stdout: '', stderr: '', ...this.reply(command) });
  }
  writeFile(): Promise<void> {
    return Promise.resolve();
  }
  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

function targetWith(reply: (cmd: string) => Partial<ExecResult>): {
  target: Target;
  exec: FakeExecutor;
} {
  const exec = new FakeExecutor(reply);
  return {
    exec,
    target: { exec, os: 'linux', arch: 'amd64', passwordlessSudo: false },
  };
}

describe('finding a running connector', () => {
  const shell = new LocalExecutor();

  it('does not find itself — where `pgrep -f` did', async () => {
    const naive = await shell.exec(
      `pgrep -f '${ABSENT} tunnel run' >/dev/null 2>&1 && echo active || echo inactive`,
    );
    expect(naive.stdout.trim()).toBe('active'); // a false positive, with nothing running

    expect((await shell.exec(pidProbe(ABSENT))).stdout.trim()).toBe('inactive');
  });

  it('does not find itself even though the script names cloudflared elsewhere', async () => {
    // Why the bracket trick is not the fix. `[c]loudflared` cannot match its own literal, but
    // these scripts mention cloudflared again — the systemd unit, at least — and the `.*`
    // needed to span a connector's flags happily bridges that mention to the `tunnel run`
    // further along, matching the carrier all over again.
    const mention = `systemctl is-active ${ABSENT} >/dev/null 2>&1; `;

    const bracketed = await shell.exec(
      mention +
        `pgrep -f '[${ABSENT[0]}]${ABSENT.slice(1)} .*tunnel run' >/dev/null 2>&1 && echo active || echo inactive`,
    );
    expect(bracketed.stdout.trim()).toBe('active'); // still a false positive

    const shipped = await shell.exec(mention + pidProbe(ABSENT));
    expect(shipped.stdout.trim()).toBe('inactive');
  });

  it('does not kill the shell that is about to start the connector', async () => {
    const naive = await shell.exec(
      `( pkill -f '${ABSENT} tunnel run' 2>/dev/null || true ) ; echo started`,
    );
    // The old shape never reached the echo: pkill took out its own wrapper shell.
    expect(naive.stdout).not.toContain('started');

    const byPid = await shell.exec(
      `probe() { for p in $(pgrep -x ${ABSENT} 2>/dev/null); do echo "$p"; done; }; ` +
        `p=$(probe); [ -n "$p" ] && kill $p 2>/dev/null; true; echo started`,
    );
    expect(byPid.stdout).toContain('started');
  });

  it('is what the service actually ships — no command-line matching anywhere', async () => {
    const { target, exec } = targetWith(() => ({ stdout: 'inactive' }));
    const service = new CloudflaredService();
    await service.runState(target);
    await service.uninstallConnector(target);
    await service.controlService(target, 'stop');

    expect(exec.commands.some((c) => c.includes('pgrep -x cloudflared'))).toBe(true);
    for (const command of exec.commands) {
      expect(command).not.toMatch(/pgrep\s+(-\w+\s+)*-f\b/);
      expect(command).not.toContain('pkill');
    }
  });
});

describe('runState', () => {
  const service = new CloudflaredService();

  it.each([
    ['active', 'running'],
    ['inactive', 'stopped'],
    ['failed', 'error'],
    ['', 'unknown'],
  ])('reads %o as %o', async (stdout, expected) => {
    const { target } = targetWith(() => ({ stdout }));
    await expect(service.runState(target)).resolves.toBe(expected);
  });

  it('asks about cloudflared.service, not anything starting with cloudflared', async () => {
    const { target, exec } = targetWith(() => ({ stdout: 'inactive' }));
    await service.runState(target);
    // `^cloudflared` also matched a leftover cloudflared-update.timer, which made a node with
    // no connector unit look like it had one.
    expect(exec.commands[0]).toContain(String.raw`'^cloudflared\.service'`);
  });
});

describe('installConnector', () => {
  it('does not report a service that a clean exit code did not actually start', async () => {
    // `cloudflared service install` has returned 0 leaving no unit behind. Believing it stored
    // serviceInstalled=1 on a node whose tunnel never came up.
    const { target, exec } = targetWith((cmd) =>
      cmd.includes('nohup') ? { stdout: 'started' } : { stdout: 'inactive' },
    );
    const result = await new CloudflaredService().installConnector(
      { ...target, passwordlessSudo: true },
      'token',
    );

    expect(result.serviceInstalled).toBe(false);
    expect(result.note).toContain('background process');
    expect(exec.commands.some((c) => c.includes('nohup'))).toBe(true);
  });

  it('reports the service when the connector really is up', async () => {
    const { target } = targetWith((cmd) =>
      cmd.includes('connector_pids') ? { stdout: 'active' } : { stdout: '' },
    );
    const result = await new CloudflaredService().installConnector(
      { ...target, passwordlessSudo: true },
      'token',
    );

    expect(result.serviceInstalled).toBe(true);
    expect(result.note).toBeNull();
  });
});
