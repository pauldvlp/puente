import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { NodeSSH } from 'node-ssh';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import SSHConfig from 'ssh-config';
import type { SshConfigHost, SshKey, SshTestResult } from '@puente/shared';
import { KEYS_DIR } from '../../config/paths';
import {
  CommandExecutor,
  LocalExecutor,
  ExecResult,
} from '../../common/executor';
import { shq, normalizeOs, normalizeArch } from '../../common/shell';
import type { NodeRow } from '../../db/schema';

const execFileAsync = promisify(execFile);

export interface DetectResult {
  os: string | null;
  arch: string | null;
  hostname: string | null;
  passwordlessSudo: boolean;
  cloudflaredVersion: string | null;
}

interface RawConnectConfig {
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string | null;
  password?: string;
  expectedFingerprint?: string | null;
}

/** SSH executor sharing the CommandExecutor contract with LocalExecutor. */
class SshExecutor implements CommandExecutor {
  readonly kind = 'ssh' as const;
  constructor(private readonly ssh: NodeSSH) {}

  async exec(command: string, opts: { input?: string } = {}): Promise<ExecResult> {
    const r = await this.ssh.execCommand(command, { stdin: opts.input });
    return { code: r.code ?? 0, stdout: r.stdout, stderr: r.stderr };
  }

  async writeFile(path: string, content: string, mode = 0o600): Promise<void> {
    const dir = path.replace(/\/[^/]*$/, '') || '/';
    await this.exec(`mkdir -p ${shq(dir)}`);
    const r = await this.ssh.execCommand(`cat > ${shq(path)}`, { stdin: content });
    if (r.code) throw new Error(`remote write failed: ${r.stderr}`);
    await this.exec(`chmod ${mode.toString(8)} ${shq(path)}`);
  }

  async dispose(): Promise<void> {
    this.ssh.dispose();
  }
}

@Injectable()
export class SshService {
  private readonly logger = new Logger(SshService.name);

  /** Low-level connect that also captures/pins the host key fingerprint. */
  private async rawConnect(
    cfg: RawConnectConfig,
  ): Promise<{ ssh: NodeSSH; fingerprint: string }> {
    const ssh = new NodeSSH();
    let fingerprint = '';
    let rejected = false;
    await ssh.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      privateKeyPath: cfg.privateKeyPath ?? undefined,
      password: cfg.password,
      tryKeyboard: Boolean(cfg.password),
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      // ssh2 host key verification: TOFU on first contact, pin thereafter.
      hostVerifier: (key: Buffer) => {
        fingerprint =
          'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
        if (cfg.expectedFingerprint && cfg.expectedFingerprint !== fingerprint) {
          rejected = true;
          return false;
        }
        return true;
      },
    } as Parameters<NodeSSH['connect']>[0]);
    if (rejected) {
      ssh.dispose();
      throw new BadRequestException({
        statusCode: 400,
        error: 'HostKeyMismatch',
        message: 'The host key changed since it was first trusted (possible MITM).',
        code: 'HOST_KEY_MISMATCH',
      });
    }
    return { ssh, fingerprint };
  }

  /** Build a CommandExecutor for a node (local or remote). Caller must dispose(). */
  async getExecutor(node: NodeRow): Promise<CommandExecutor> {
    if (node.kind === 'local') return new LocalExecutor();
    const { ssh } = await this.rawConnect({
      host: node.sshHost!,
      port: node.sshPort ?? 22,
      username: node.sshUsername!,
      privateKeyPath: node.sshPrivateKeyPath,
      expectedFingerprint: node.sshHostKeyFingerprint,
    });
    return new SshExecutor(ssh);
  }

  /** Detect OS/arch/hostname/sudo/cloudflared on any executor target. */
  async detect(exec: CommandExecutor): Promise<DetectResult> {
    const uname = await exec.exec('uname -s; uname -m; hostname 2>/dev/null || echo unknown');
    const [osRaw = '', archRaw = '', hostRaw = ''] = uname.stdout.trim().split('\n');
    const os = normalizeOs(osRaw);
    const arch = normalizeArch(archRaw);
    const sudo = await exec.exec('sudo -n true 2>/dev/null && echo yes || echo no');
    const cf = await exec.exec('cloudflared --version 2>/dev/null || echo none');
    return {
      os: os === 'unknown' ? osRaw.trim() || null : os,
      arch: arch ?? (archRaw.trim() || null),
      hostname: hostRaw.trim() || null,
      passwordlessSudo: sudo.stdout.includes('yes'),
      cloudflaredVersion: parseCloudflaredVersion(cf.stdout),
    };
  }

  /**
   * Test connectivity to a host with either a key path or a one-time password,
   * detecting facts the UI needs to decide next steps.
   */
  async test(params: {
    host: string;
    port: number;
    username: string;
    privateKeyPath?: string | null;
    password?: string;
    expectedFingerprint?: string | null;
  }): Promise<SshTestResult> {
    let ssh: NodeSSH | null = null;
    try {
      const conn = await this.rawConnect(params);
      ssh = conn.ssh;
      const exec = new SshExecutor(ssh);
      const detected = await this.detect(exec);
      return {
        ok: true,
        reachable: true,
        authenticated: true,
        os: detected.os,
        arch: detected.arch,
        hostname: detected.hostname,
        passwordlessSudo: detected.passwordlessSudo,
        cloudflaredVersion: detected.cloudflaredVersion,
        hostKeyFingerprint: conn.fingerprint,
        message: 'Connected successfully.',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const authFail = /authentication|permission denied|all configured auth/i.test(message);
      return {
        ok: false,
        reachable: !authFail,
        authenticated: false,
        os: null,
        arch: null,
        hostname: null,
        passwordlessSudo: null,
        cloudflaredVersion: null,
        hostKeyFingerprint: null,
        message,
      };
    } finally {
      ssh?.dispose();
    }
  }

  /**
   * Bootstrap passwordless key auth: generate a dedicated ed25519 key, push the
   * public key to ~/.ssh/authorized_keys over a one-time-password session, then
   * verify key auth works. Returns the managed key path + pinned fingerprint.
   */
  async bootstrapPasswordless(params: {
    host: string;
    port: number;
    username: string;
    password: string;
    keyName: string;
  }): Promise<{ privateKeyPath: string; publicKey: string; fingerprint: string }> {
    const keyPath = join(KEYS_DIR, `${params.keyName}_ed25519`);
    if (!existsSync(keyPath)) {
      await execFileAsync('ssh-keygen', [
        '-t',
        'ed25519',
        '-N',
        '',
        '-f',
        keyPath,
        '-C',
        `puente@${params.host}`,
      ]);
    }
    const publicKey = (await readFile(`${keyPath}.pub`, 'utf8')).trim();

    // Push the public key using the one-time password.
    const { ssh, fingerprint } = await this.rawConnect({
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
    });
    try {
      const remoteCmd =
        `install -d -m 700 "$HOME/.ssh" && ` +
        `touch "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys" && ` +
        `(grep -qxF ${shq(publicKey)} "$HOME/.ssh/authorized_keys" || ` +
        `printf '%s\\n' ${shq(publicKey)} >> "$HOME/.ssh/authorized_keys")`;
      const r = await ssh.execCommand(remoteCmd);
      if (r.code !== 0) {
        throw new Error(`Failed to install public key: ${r.stderr || r.stdout}`);
      }
    } finally {
      ssh.dispose();
    }

    // Verify key-based auth now works; from here the password is never reused.
    const verify = await this.rawConnect({
      host: params.host,
      port: params.port,
      username: params.username,
      privateKeyPath: keyPath,
      expectedFingerprint: fingerprint,
    });
    try {
      const ok = await verify.ssh.execCommand('echo puente-ok');
      if (!ok.stdout.includes('puente-ok')) {
        throw new Error('Key authentication verification failed.');
      }
    } finally {
      verify.ssh.dispose();
    }

    return { privateKeyPath: keyPath, publicKey, fingerprint };
  }

  /** Parse the operator's ~/.ssh/config into reusable host aliases. */
  async parseUserSshConfig(): Promise<SshConfigHost[]> {
    const path = join(homedir(), '.ssh', 'config');
    if (!existsSync(path)) return [];
    try {
      const parsed = SSHConfig.parse(await readFile(path, 'utf8'));
      const hosts: SshConfigHost[] = [];
      for (const line of parsed) {
        // Only "Host" directives with a concrete (non-wildcard) alias.
        const anyLine = line as unknown as { param?: string; value?: unknown };
        if (anyLine.param?.toLowerCase() !== 'host') continue;
        const aliases = Array.isArray(anyLine.value) ? anyLine.value : [anyLine.value];
        for (const alias of aliases) {
          if (typeof alias !== 'string' || alias.includes('*') || alias.includes('?')) continue;
          const computed = parsed.compute(alias) as Record<string, unknown>;
          const identity = computed.IdentityFile;
          hosts.push({
            alias,
            hostName: (computed.HostName as string) ?? null,
            user: (computed.User as string) ?? null,
            port: computed.Port ? Number(computed.Port) : null,
            identityFile: Array.isArray(identity)
              ? (identity[0] as string)
              : ((identity as string) ?? null),
          });
        }
      }
      return hosts;
    } catch (err) {
      this.logger.warn(`Could not parse ~/.ssh/config: ${String(err)}`);
      return [];
    }
  }

  /** List puente-managed SSH key pairs (public halves only). */
  async listManagedKeys(): Promise<SshKey[]> {
    if (!existsSync(KEYS_DIR)) return [];
    const files = await readdir(KEYS_DIR);
    const keys: SshKey[] = [];
    for (const f of files) {
      if (!f.endsWith('.pub')) continue;
      const pubPath = join(KEYS_DIR, f);
      const publicKey = (await readFile(pubPath, 'utf8')).trim();
      keys.push({
        name: f.replace(/\.pub$/, ''),
        path: join(KEYS_DIR, f.replace(/\.pub$/, '')),
        publicKey,
        type: publicKey.split(' ')[0] ?? 'ssh-ed25519',
        managed: true,
      });
    }
    return keys;
  }
}

function parseCloudflaredVersion(output: string): string | null {
  const m = output.match(/cloudflared version (\S+)/i);
  return m ? m[1] : null;
}
