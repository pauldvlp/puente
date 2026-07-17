# Contributing to puente

First off — thank you for taking the time to contribute! 🎉

puente is a self-hosted control panel for Cloudflare Tunnels. This guide gets you
from a fresh clone to a running dev environment and a merged pull request.

---

## Ways to contribute

- 🐛 **Report bugs** — open a [bug report](https://github.com/pauldvlp/puente/issues/new/choose).
- 💡 **Request features** — open a feature request and describe the use case.
- 📝 **Improve docs** — typos, clarifications, and examples are all welcome.
- 🔧 **Send code** — fixes and features via pull requests (see below).

For anything security-related, **do not open a public issue** — follow
[`SECURITY.md`](./SECURITY.md) instead.

---

## Prerequisites

- **Node.js ≥ 22.13** — required by pnpm 11 for local development. (The published
  `puente` package itself runs on Node ≥ 22.)
- **pnpm ≥ 11** (`corepack enable` then `corepack use pnpm@latest`, or `npm i -g pnpm`)
- **git**
- A C/C++ toolchain + Python only if `better-sqlite3` has to build from source on
  your platform (prebuilt binaries cover most).

## Project layout

```
apps/
  server/    NestJS control plane + CLI — the published `puente` package
  web/       React + Vite dashboard (bundled into the server at build time)
packages/
  shared/    Zod schemas + TypeScript types shared by server and web (@puente/shared)
  alias/     Thin package that re-exports `puente` under @pauldvlp/puente
```

## Getting started

```bash
git clone https://github.com/pauldvlp/puente.git
cd puente
pnpm install

# Build the shared contracts once — server & web both consume it
pnpm --filter @puente/shared build

# Run the backend (http://localhost:5006) and the Vite dev server (http://localhost:5173)
pnpm dev
```

In development the Vite dev server proxies `/api` to the NestJS server. Open
http://localhost:5173 and the first screen walks you through setup.

Handy scripts (run from the repo root):

```bash
pnpm dev          # server + web in watch mode
pnpm build        # full production build → apps/server/dist is self-contained
pnpm typecheck    # typecheck every package
pnpm start        # run the built panel (after pnpm build)
```

Local state lives in `~/.puente/` (override with `PUENTE_DATA_DIR`). To start from a
clean slate, delete that directory. **Never commit anything from it** — it holds
your encryption key, database, and SSH keys.

## Testing your change end-to-end

puente talks to the real Cloudflare API and orchestrates `cloudflared`. Before
opening a PR that touches tunnel/route/SSH logic, please verify against a real (or
throwaway) Cloudflare zone that the happy path still works: connect a token,
provision a node, publish a route, confirm the subdomain resolves, then delete the
node and confirm cleanup. Note in the PR what you exercised.

---

## Commit messages — Conventional Commits

This repo uses **[Conventional Commits](https://www.conventionalcommits.org/)**.
They drive automated versioning and the changelog, so they are enforced by a
`commit-msg` git hook (commitlint) and by a PR-title check.

Format:

```
<type>(<optional scope>): <description>
```

Common types:

| Type       | When to use it                                          | Version bump |
| ---------- | ------------------------------------------------------- | ------------ |
| `feat`     | A new feature                                           | minor        |
| `fix`      | A bug fix                                               | patch        |
| `docs`     | Documentation only                                      | none         |
| `refactor` | Code change that neither fixes a bug nor adds a feature | none         |
| `perf`     | Performance improvement                                 | patch        |
| `test`     | Adding or fixing tests                                  | none         |
| `build`    | Build system, dependencies, packaging                   | none         |
| `ci`       | CI configuration                                        | none         |
| `chore`    | Housekeeping that doesn't touch `src`                   | none         |

Suggested scopes: `server`, `web`, `shared`, `cli`, `ssh`, `cloudflare`,
`docker`, `deps`.

Examples:

```
feat(routes): allow wildcard subdomains
fix(ssh): retry key auth after passwordless bootstrap
docs: clarify the required Cloudflare token scopes
```

**Breaking changes:** add a `!` after the type/scope (`feat(cli)!: …`) or a
`BREAKING CHANGE:` footer. This triggers a major version bump.

---

## Pull request process

1. **Fork** the repo and create a branch from `main`
   (`git checkout -b feat/short-description`).
2. Make your change. Keep PRs focused — one logical change per PR.
3. Run `pnpm typecheck` and `pnpm build` locally; make sure both pass.
4. Use a **Conventional Commits** title for the PR (it's linted).
5. Fill in the PR template, describing what you changed and how you tested it.
6. Open the PR against `main`. CI will run typecheck + build + a packaging smoke
   test.

A maintainer will review. Once merged, [release-please](https://github.com/googleapis/release-please)
rolls your change into the next version and changelog automatically — you don't
need to bump versions yourself.

---

## Releases (for maintainers)

Releases are automated:

- Merging Conventional Commits to `main` makes **release-please** open/update a
  "release PR" that bumps the version and updates `CHANGELOG.md`.
- Merging that release PR tags the version, which triggers the **publish**
  workflow: it builds, then publishes both `puente` and its alias
  `@pauldvlp/puente` to npm with provenance.

---

## Code of Conduct

By participating you agree to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).
