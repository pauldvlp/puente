import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Isolated data dir: config/paths reads PUENTE_DATA_DIR at module load, so the crypto
// service creates its master key here instead of ~/.puente.
const PUENTE_DATA_DIR = path.join(process.cwd(), '.vitest-data');
process.env.PUENTE_DATA_DIR = PUENTE_DATA_DIR;

export default defineConfig({
  test: {
    environment: 'node',
    // `.spec.ts` (not `.test.ts`) — tsconfig.build.json already excludes it, so tests
    // never reach the published package.
    include: ['apps/*/src/**/*.spec.ts', 'packages/*/src/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: { PUENTE_DATA_DIR },
  },
});
