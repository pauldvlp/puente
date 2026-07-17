import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

// Flat config (the only shape ESLint 10 accepts). Non-type-checked: fast, no `project`
// wiring — a lint gate, not a second type-checker (that's `pnpm typecheck`).
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts'],
  },
  // TypeScript across the monorepo
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  // Plain JS / ESM tooling (scripts, config files)
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  // Node-side globals: server (NestJS), shared, scripts
  {
    files: ['apps/server/**', 'packages/shared/**', 'scripts/**', 'packages/alias/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  // React web: browser globals + the hooks rules
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  // Must be last: turns off every rule Prettier owns, so the two never disagree.
  prettier,
);
