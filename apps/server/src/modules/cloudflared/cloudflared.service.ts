import { Injectable, Logger } from '@nestjs/common';
import type { ConnectorRunState } from '@puente/shared';
import { CommandExecutor } from '../../common/executor';
import { shq } from '../../common/shell';
import { DATA_DIR } from '../../config/paths';

export interface Target {
  exec: CommandExecutor;
  os: string | null;
  arch: string | null;
  passwordlessSudo: boolean;
}

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/**
 * Shell defining `connector_pids`: the pids of cloudflared processes running a tunnel.
 *
 * Deliberately not `pgrep -f`. `-f` matches whole command lines, and the command line of the
 * `bash -lc "<script>"` carrying the check contains the script — pattern included — so any
 * pattern spelling out `cloudflared … tunnel run` finds itself, on every machine. That is what
 * put a green "Connector · Running" beside a tunnel with zero connections, and what made the
 * no-sudo start path `pkill` the very shell that was about to launch the connector.
 *
 * Bracketing the first letter is not enough: these scripts name `cloudflared` elsewhere (the
 * systemd unit, for one), and a `.*` in the pattern bridges that occurrence to the `tunnel run`
 * further along, matching the carrier all over again.
 *
 * `pgrep -x` matches the executable name instead, which for the carrier is `bash` — no command
 * line involved, so no way to match itself. Each candidate is then confirmed by reading back
 * its own arguments by pid, which likewise only ever inspects that one process.
 */
const CONNECTOR_PIDS =
  'connector_pids() { for p in $(pgrep -x cloudflared 2>/dev/null); do ' +
  'case "$(ps -o args= -p "$p" 2>/dev/null)" in *"tunnel run"*) echo "$p";; esac; done; }';

/** Stop every connector on the target, by pid — `pkill -f` would take the calling shell with it. */
const KILL_CONNECTORS = `${CONNECTOR_PIDS}; p=$(connector_pids); [ -n "$p" ] && kill $p 2>/dev/null; true`;

/**
 * Installs and controls the cloudflared connector on a target machine (local or
 * SSH). All logic is expressed in terms of a CommandExecutor so the same code
 * path drives the control-plane host and remote nodes.
 */
@Injectable()
export class CloudflaredService {
  private readonly logger = new Logger(CloudflaredService.name);

  /** Resolve the URL of the correct cloudflared release asset for a target. */
  private assetUrl(target: Target): string {
    const os = target.os === 'darwin' ? 'darwin' : 'linux';
    const arch = target.arch ?? 'amd64';
    return os === 'darwin'
      ? `${RELEASE_BASE}/cloudflared-darwin-${arch}.tgz`
      : `${RELEASE_BASE}/cloudflared-linux-${arch}`;
  }

  private sudo(target: Target, cmd: string): string {
    return target.passwordlessSudo ? `sudo -n ${cmd}` : cmd;
  }

  /** Ensure cloudflared exists on the target; download it if missing. Returns the version. */
  async ensureInstalled(
    target: Target,
    knownVersion: string | null,
  ): Promise<{ version: string | null; installedNow: boolean }> {
    if (knownVersion) return { version: knownVersion, installedNow: false };

    const url = this.assetUrl(target);
    const isDarwin = target.os === 'darwin';
    const tmp = '/tmp/puente-cloudflared';
    const dl = isDarwin
      ? `curl -fsSL ${shq(url)} -o ${tmp}.tgz && tar -xzf ${tmp}.tgz -C /tmp && mv /tmp/cloudflared ${tmp}`
      : `curl -fsSL ${shq(url)} -o ${tmp}`;

    const download = await target.exec.exec(`${dl} && chmod +x ${tmp}`, { timeoutMs: 180000 });
    if (download.code !== 0) {
      throw new Error(`Failed to download cloudflared: ${download.stderr || download.stdout}`);
    }

    // Install into a durable location.
    let install: string;
    if (target.passwordlessSudo) {
      install = `sudo -n install -m 755 ${tmp} /usr/local/bin/cloudflared`;
    } else {
      install = `mkdir -p "$HOME/.local/bin" && install -m 755 ${tmp} "$HOME/.local/bin/cloudflared"`;
    }
    const res = await target.exec.exec(install);
    if (res.code !== 0) {
      throw new Error(`Failed to install cloudflared: ${res.stderr || res.stdout}`);
    }
    const cmd = await this.resolveCmd(target);
    const ver = await target.exec.exec(`${shq(cmd)} --version 2>/dev/null || echo none`);
    const m = ver.stdout.match(/cloudflared version (\S+)/i);
    return { version: m ? m[1] : null, installedNow: true };
  }

  private async resolveCmd(target: Target): Promise<string> {
    const r = await target.exec.exec(
      'command -v cloudflared 2>/dev/null || echo "$HOME/.local/bin/cloudflared"',
    );
    return r.stdout.trim() || 'cloudflared';
  }

  /**
   * Install the connector as a persistent OS service using the tunnel token.
   * Falls back to a detached background process when sudo is unavailable.
   */
  async installConnector(
    target: Target,
    token: string,
  ): Promise<{ serviceInstalled: boolean; note: string | null }> {
    const cmd = await this.resolveCmd(target);
    if (target.passwordlessSudo) {
      // Reinstall cleanly: uninstall any prior service first (ignore failure).
      await target.exec.exec(`sudo -n ${shq(cmd)} service uninstall 2>/dev/null || true`);
      const res = await target.exec.exec(`sudo -n ${shq(cmd)} service install ${shq(token)}`, {
        timeoutMs: 60000,
      });
      // A zero exit is not proof: it has come back clean leaving no unit behind,
      // and the node then sat in the dashboard as "Running" with the tunnel down.
      if (res.code === 0 && (await this.waitForRunning(target))) {
        return { serviceInstalled: true, note: null };
      }
      this.logger.warn(
        `service install left no running connector, falling back to detached run: ${res.stderr}`,
      );
    }
    // No passwordless sudo (or install failed): run detached so it works now.
    await this.runDetached(target, token, cmd);
    return {
      serviceInstalled: false,
      note: 'Running as a background process (no passwordless sudo). Install as a persistent service with sudo for restart-on-boot.',
    };
  }

  /** Poll the target briefly: a freshly installed service needs a moment to come up. */
  private async waitForRunning(target: Target, attempts = 3): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      if ((await this.runState(target)) === 'running') return true;
      if (i < attempts - 1) await target.exec.exec('sleep 1');
    }
    return false;
  }

  private async runDetached(target: Target, token: string, cmd: string): Promise<void> {
    const logDir = target.exec.kind === 'local' ? DATA_DIR : '$HOME/.puente';
    const run =
      `mkdir -p ${logDir} && ` +
      `( ${KILL_CONNECTORS} ) ; ` +
      `nohup ${shq(cmd)} tunnel run --token ${shq(token)} ` +
      `>> ${logDir}/cloudflared.log 2>&1 & disown; sleep 1; echo started`;
    const res = await target.exec.exec(run, { timeoutMs: 20000 });
    if (!res.stdout.includes('started')) {
      throw new Error(`Failed to start cloudflared: ${res.stderr || res.stdout}`);
    }
  }

  async uninstallConnector(target: Target): Promise<void> {
    const cmd = await this.resolveCmd(target);
    if (target.passwordlessSudo) {
      await target.exec.exec(`sudo -n ${shq(cmd)} service uninstall 2>/dev/null || true`);
    }
    await target.exec.exec(KILL_CONNECTORS);
  }

  async controlService(target: Target, action: 'start' | 'stop' | 'restart'): Promise<void> {
    if (target.os === 'darwin') {
      const label = 'com.cloudflare.cloudflared';
      const map = { start: 'start', stop: 'stop', restart: 'kickstart -k' } as const;
      await target.exec.exec(
        this.sudo(target, `launchctl ${map[action]} system/${label} 2>/dev/null || true`),
      );
      return;
    }
    // linux (systemd) with a detached-process fallback
    const hasSystemd = await target.exec.exec(
      'command -v systemctl >/dev/null 2>&1 && echo yes || echo no',
    );
    if (hasSystemd.stdout.includes('yes')) {
      const res = await target.exec.exec(this.sudo(target, `systemctl ${action} cloudflared`));
      if (res.code === 0) return;
    }
    // Fallback for a target with no systemd: stopping is a kill, and starting is handled by
    // reinstalling the connector.
    if (action === 'stop') {
      await target.exec.exec(KILL_CONNECTORS);
    }
  }

  /**
   * Is a connector actually up on this target?
   *
   * Both halves are asked, not one or the other: a unit can exist while the connector runs
   * detached (or the other way round), and the old service-else-process shape reported the
   * wrong one whenever both were in play. `^cloudflared\.service` rather than `^cloudflared`
   * so a leftover `cloudflared-update.timer` cannot pass for the connector itself.
   */
  async runState(target: Target): Promise<ConnectorRunState> {
    const script = [
      CONNECTOR_PIDS,
      `unit=''`,
      `if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared\\.service'; then unit=$(systemctl is-active cloudflared 2>/dev/null); fi`,
      `if [ "$unit" = active ]; then echo active`,
      `elif [ -n "$(connector_pids)" ]; then echo active`,
      `elif [ -n "$unit" ]; then echo "$unit"`,
      `else echo inactive; fi`,
    ].join('; ');
    const res = await target.exec.exec(script);
    const out = res.stdout.trim();
    if (out.includes('failed')) return 'error';
    if (out.includes('inactive')) return 'stopped';
    if (out.includes('active')) return 'running';
    return 'unknown';
  }
}
