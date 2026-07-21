import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const PORT = 5099; // away from puente's default 5006
const DATA_DIR = path.join(process.cwd(), '.e2e-data');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // one server, one SQLite, one first-run state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The data dir is wiped in the command, not in globalSetup: Playwright waits for the
    // server to be ready before globalSetup runs, so first-run state must exist by then.
    // Requires `pnpm build` first (CI builds in the same job).
    command: `rm -rf ${DATA_DIR} && node apps/server/dist/cli.js start --port ${PORT} --host 127.0.0.1 --no-open`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 120_000,
    reuseExistingServer: false, // always a fresh, admin-less DB
    env: { PUENTE_DATA_DIR: DATA_DIR },
  },
});
