// Post-build packaging: make dist/ self-contained so the published package
// needs no workspace linking.
//  1) Inline @puente/shared into dist/node_modules/@puente/shared
//  2) Copy the built web SPA into dist/public (served by ServeStaticModule)
import { cp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(__dirname, '..');
const repoRoot = resolve(serverDir, '../..');
const distDir = join(serverDir, 'dist');

const exists = (p) => access(p).then(() => true).catch(() => false);

async function inlineShared() {
  const sharedDist = join(repoRoot, 'packages/shared/dist');
  if (!(await exists(sharedDist))) {
    throw new Error(`@puente/shared is not built (${sharedDist}). Run "pnpm --filter @puente/shared build" first.`);
  }
  const target = join(distDir, 'node_modules/@puente/shared');
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(sharedDist, target, { recursive: true });
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify(
      {
        name: '@puente/shared',
        version: '0.1.0',
        private: true,
        main: './index.cjs',
        module: './index.js',
        types: './index.d.ts',
        exports: {
          '.': {
            types: './index.d.ts',
            import: './index.js',
            require: './index.cjs',
          },
        },
      },
      null,
      2,
    ),
  );
  console.log('  ✔ inlined @puente/shared → dist/node_modules/@puente/shared');
}

async function copyWeb() {
  const webDist = join(repoRoot, 'apps/web/dist');
  const target = join(distDir, 'public');
  if (!(await exists(webDist))) {
    console.log('  ! web build not found (apps/web/dist) — skipping SPA copy.');
    console.log('    Build the web app first: pnpm --filter @puente/web build');
    return;
  }
  await rm(target, { recursive: true, force: true });
  await cp(webDist, target, { recursive: true });
  console.log('  ✔ copied web SPA → dist/public');
}

console.log('\n  Packaging puente…');
await inlineShared();
await copyWeb();
console.log('  ✔ dist is self-contained.\n');
