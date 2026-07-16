import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** Data to pipe to the command's stdin. */
  input?: string;
  timeoutMs?: number;
}

/**
 * Runs shell commands on a target machine. Two implementations — one for the
 * control-plane host itself (child_process), one over SSH — let cloudflared
 * orchestration logic be written once and reused for local and remote nodes.
 */
export interface CommandExecutor {
  readonly kind: 'local' | 'ssh';
  exec(command: string, opts?: ExecOptions): Promise<ExecResult>;
  writeFile(path: string, content: string, mode?: number): Promise<void>;
  dispose(): Promise<void>;
}

export class LocalExecutor implements CommandExecutor {
  readonly kind = 'local' as const;

  exec(command: string, opts: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve) => {
      const child = spawn('bash', ['-lc', command], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            if (!settled) {
              settled = true;
              child.kill('SIGKILL');
              resolve({ code: 124, stdout, stderr: stderr + '\n[timeout]' });
            }
          }, opts.timeoutMs)
        : null;

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ code: 127, stdout, stderr: stderr + String(err) });
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });

      if (opts.input) child.stdin.write(opts.input);
      child.stdin.end();
    });
  }

  async writeFile(path: string, content: string, mode = 0o600): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { mode });
  }

  async dispose(): Promise<void> {
    /* nothing to clean up */
  }
}
