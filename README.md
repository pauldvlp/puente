# ☁️ puente

**A centralized, self-hosted manager for Cloudflare Tunnels across your machines.**
Expose local ports — on this PC or on remote servers reached over SSH — on your own subdomains, from one beautiful web UI.

<p>
  <a href="https://www.npmjs.com/package/puente"><img alt="npm" src="https://img.shields.io/npm/v/puente?color=%230b7285&label=puente"></a>
  <a href="https://github.com/pauldvlp/puente/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pauldvlp/puente/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node >= 20" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen">
</p>

```bash
npx puente           # run it right now — opens the panel + guided setup
# or install it:
npm install -g puente && puente
```

> Published as **[`puente`](https://www.npmjs.com/package/puente)** (and the identical
> scoped alias **[`@pauldvlp/puente`](https://www.npmjs.com/package/@pauldvlp/puente)**).
> Full install & usage docs live in [`apps/server/README.md`](apps/server/README.md).

---

## What it does

- Create & manage **Cloudflare Tunnels** and their ingress rules via the Cloudflare API.
- Map a local port to a subdomain (`port 7008 → vw.example.com`) — updates ingress **and** DNS automatically.
- Orchestrate `cloudflared` on the **local machine and remote nodes over SSH** (auto-install, service setup, start/stop).
- One-click **passwordless SSH** bootstrap for new hosts.
- Live status via Server-Sent Events, encrypted secrets at rest, single-command install.

## Install

```bash
# Run once, no install
npx puente

# Global install (pick your package manager)
npm  install -g puente      # then: puente
pnpm add     -g puente
bun  add     -g puente

# Or self-host with Docker
docker compose up -d       # panel on http://localhost:5006
```

Then open **http://localhost:5006** — the first screen walks you through everything.
See the [full setup guide](apps/server/README.md#first-run-setup-about-2-minutes),
including the exact Cloudflare API token scopes.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 · Vite · TanStack Query · react-router · custom design system (light/dark) |
| Backend | NestJS 11 (Express 5) · SSE · JWT auth |
| Persistence | SQLite via Drizzle ORM + better-sqlite3 |
| Cloudflare | Official `cloudflare` SDK (remotely-managed tunnels) |
| SSH | `node-ssh` / `ssh2` |
| Packaging | pnpm workspace → single installable npm package with a `puente` CLI |

## Repository layout

```
apps/
  server/      NestJS control plane + CLI — published as `puente`
  web/         React + Vite dashboard (bundled into the server at build)
packages/
  shared/      Zod schemas + TypeScript types shared by server and web
  alias/        @pauldvlp/puente — thin alias that re-exports `puente`
```

## Development

Requires Node ≥ 20 and pnpm ≥ 11. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the full guide.

```bash
pnpm install
pnpm --filter @puente/shared build   # build shared contracts once
pnpm dev                            # server :5006 + web dev server :5173
pnpm typecheck
pnpm build                          # → apps/server/dist is a self-contained, publishable package
```

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** (dev
setup, Conventional Commits, PR process) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). Good first stops:
[open issues](https://github.com/pauldvlp/puente/issues) ·
[discussions](https://github.com/pauldvlp/puente/discussions).

## Security

puente handles Cloudflare tokens and SSH credentials. Secrets are encrypted at rest
(AES-256-GCM), the admin password is scrypt-hashed, and there is **no telemetry**.
Please report vulnerabilities privately — see **[SECURITY.md](./SECURITY.md)**.

---

MIT © [pauldvlp](https://github.com/pauldvlp) — see [LICENSE](./LICENSE).
