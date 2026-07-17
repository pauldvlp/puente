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
      if (res.code === 0) {
        return { serviceInstalled: true, note: null };
      }
      this.logger.warn(`service install failed, falling back to detached run: ${res.stderr}`);
    }
    // No passwordless sudo (or install failed): run detached so it works now.
    await this.runDetached(target, token, cmd);
    return {
      serviceInstalled: false,
      note: 'Running as a background process (no passwordless sudo). Install as a persistent service with sudo for restart-on-boot.',
    };
  }

  private async runDetached(target: Target, token: string, cmd: string): Promise<void> {
    const logDir = target.exec.kind === 'local' ? DATA_DIR : '$HOME/.puente';
    const run =
      `mkdir -p ${logDir} && ` +
      `( pkill -f ${shq(`${cmd} tunnel run`)} 2>/dev/null || true ) ; ` +
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
    await target.exec.exec(`pkill -f ${shq(`${cmd} tunnel run`)} 2>/dev/null || true`);
  }

  async controlService(target: Target, action: 'start' | 'stop' | 'restart'): Promise<void> {
    const cmd = await this.resolveCmd(target);
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
    // Fallback: emulate via pkill / detached run is handled by connector reinstall.
    if (action === 'stop') {
      await target.exec.exec(`pkill -f ${shq(`${cmd} tunnel run`)} 2>/dev/null || true`);
    }
  }

  async runState(target: Target): Promise<ConnectorRunState> {
    const cmd = `if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared'; then systemctl is-active cloudflared 2>/dev/null; else (pgrep -f 'cloudflared tunnel run' >/dev/null 2>&1 && echo active || echo inactive); fi`;
    const res = await target.exec.exec(cmd);
    const out = res.stdout.trim();
    if (out.includes('active') && !out.includes('inactive')) return 'running';
    if (out.includes('failed')) return 'error';
    if (out.includes('inactive')) return 'stopped';
    return 'unknown';
  }
}
