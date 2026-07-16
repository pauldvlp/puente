// Keep the `@pauldvlp/puente` alias package locked to the exact version of the
// primary `puente` package. Run before publishing the alias so its own version and
// its `puente` dependency both point at the just-released version — no drift, no
// manual bookkeeping.
//
//   node scripts/sync-alias.mjs
//
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const primaryPath = join(repoRoot, 'apps/server/package.json');
const aliasPath = join(repoRoot, 'packages/alias/package.json');

const primary = JSON.parse(await readFile(primaryPath, 'utf8'));
const alias = JSON.parse(await readFile(aliasPath, 'utf8'));

const version = primary.version;
if (!version) throw new Error(`No version found in ${primaryPath}`);

alias.version = version;
alias.dependencies = { ...alias.dependencies, puente: version };

await writeFile(aliasPath, JSON.stringify(alias, null, 2) + '\n');
console.log(`  ✔ @pauldvlp/puente synced to puente@${version}`);
