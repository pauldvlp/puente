# ☁️ puente

**A centralized, self-hosted control panel for Cloudflare Tunnels across all your machines.**

Run it on one computer, then expose local ports — on that machine _or_ on any remote server you reach over SSH — on your own subdomains. No open firewall ports, no public IP, no reverse proxy to babysit.

```
port 5006 on this PC              →  puente.example.com
port 6060 on this PC              →  grafana.example.com
port 7008 on a remote host (SSH)  →  vw.example.com
```

Everything is driven from one beautiful web UI. puente talks to the Cloudflare API to create the tunnels + DNS, and orchestrates the `cloudflared` connector on each machine (locally or over SSH) for you.

---

## Install & run

You need **Node.js ≥ 20**. Pick your package manager:

```bash
# Run once, without installing
npx puente

# Global install (recommended)
npm  install -g puente      # then:  puente
pnpm add     -g puente      # then:  puente
bun  add     -g puente      # then:  puente
```

> The scoped name **`@pauldvlp/puente`** is an identical alias published at the same
> version — `npx @pauldvlp/puente` works too if you prefer it.

Then just run:

```bash
puente            # starts the panel on http://localhost:5006 and opens your browser
puente setup      # same, and drops you straight into the guided setup
```

That's it. The first screen walks you through everything.

### …or with Docker

```bash
# from a clone of the repo
docker compose up -d          # panel on http://localhost:5006, state in a named volume
```

State persists in the `puente-data` volume (mounted at `/data`). Override the port
with the `PUENTE_PORT` environment variable.

---

## First-run setup (about 2 minutes)

1. **Create your admin account** — a single local login for the panel.
2. **Connect Cloudflare** — paste a scoped API token (see below). puente verifies it, shows your domains, and stores it **encrypted** on disk.
3. **Add a node** — “This machine”, or a remote host over SSH.
4. **Provision it** — puente installs `cloudflared`, creates the tunnel, and starts the connector.
5. **Publish a route** — map a local port to a subdomain. Live in seconds.

### Cloudflare API token — exact permissions

Create the token at **[dash.cloudflare.com → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)** → **Create Token → Create Custom Token**, and add exactly these four permissions:

| Category | Permission group | Access | Why |
|----------|------------------|--------|-----|
| **Account** | Cloudflare Tunnel | **Edit** | Create & configure tunnels and their ingress rules |
| **Zone** | DNS | **Edit** | Create the proxied CNAME records that route subdomains |
| **Zone** | Zone | **Read** | List your domains so you can pick where to publish |
| **Account** | Account Settings | **Read** | Auto-discover your account id |

Then set **Account Resources** = your account and **Zone Resources** = _All zones_ (or the specific domains you want to manage), create the token, and copy it once. The panel shows this same checklist while you set up.

> Prefer not to use a token? You can also authorize `cloudflared` with the browser login flow (`cloudflared tunnel login`) — but a scoped API token is the recommended, least-privilege path and the only one puente can fully automate.

---

## Managing remote machines over SSH

Add a node of type **Remote (SSH)** with its host, port and user. puente can reuse aliases from your `~/.ssh/config`.

**No key set up yet?** Use **“Passwordless SSH”** on the node. Enter the host password **once**; puente generates a dedicated `ed25519` key, installs it in the remote `~/.ssh/authorized_keys` with correct permissions, verifies key auth works, and never stores the password. From then on, everything is key-based.

When you provision a remote node, puente (over SSH):

- detects the OS/architecture (`uname`),
- installs `cloudflared` if it's missing (correct binary for that platform),
- installs it as a **persistent service** (`cloudflared service install`, via `sudo -n`) so it survives reboots — or falls back to a background process if passwordless sudo isn't available,
- wires up the tunnel token and ingress.

---

## CLI

```bash
puente [start]            # start the panel (default). --port <n>, --host <h>, --no-open
puente setup             # start + open the guided setup wizard
puente doctor            # check the local environment (Node, cloudflared, ssh)
puente info              # print paths and version
```

Environment variables: `PUENTE_PORT` (default `5006`), `PUENTE_DATA_DIR` (default `~/.puente`).

---

## Concepts

- **Node** — a machine that runs a `cloudflared` connector. One node = one Cloudflare Tunnel. The machine running puente is the `local` node; everything else is an `ssh` node.
- **Route** — a mapping from a subdomain (e.g. `vw.example.com`) to a local service on a node (e.g. `http://localhost:7008`). Publishing a route updates the tunnel's ingress rules **and** creates the proxied DNS record.

---

## Data & security

- All state lives in **`~/.puente/`** (SQLite database, encryption key, managed SSH keys).
- Secrets (Cloudflare token, tunnel tokens) are encrypted at rest with **AES-256-GCM**; the 256-bit key is generated on first run and stored `chmod 600`.
- The admin password is hashed with **scrypt**. Sessions use signed JWTs.
- Nothing is sent anywhere except the Cloudflare API. There is no telemetry.

---

## How it works

```
             ┌──────────────── your browser ────────────────┐
             │      React + Vite dashboard (this UI)         │
             └───────────────────┬──────────────────────────┘
                                 │  REST + SSE (live status)
             ┌───────────────────▼──────────────────────────┐
             │   puente control plane  (NestJS + SQLite)      │
             │   • Cloudflare API (tunnels, ingress, DNS)    │
             │   • SSH orchestration (node-ssh)              │
             │   • cloudflared lifecycle (local & remote)    │
             └───────┬───────────────────────────┬──────────┘
              local  │ child_process         SSH  │
             ┌───────▼───────┐             ┌──────▼───────────┐
             │  cloudflared  │             │   cloudflared    │
             │  (this PC)    │             │   (remote node)  │
             └───────────────┘             └──────────────────┘
                     ╲                              ╱
                      ╲     Cloudflare edge        ╱
                       ▼   (your subdomains)      ▼
```

Tunnels are **remotely-managed** (`config_src: cloudflare`): configuration lives in Cloudflare, and each connector only needs its run token — so puente can reconfigure routes at any time via the API, from one place.

---

## Requirements

- Node.js ≥ 20 on the machine running puente.
- A Cloudflare account with at least one domain (zone).
- For remote nodes: SSH access. `cloudflared` is installed automatically if missing.
- `better-sqlite3` ships prebuilt binaries; on unusual platforms a C/C++ toolchain + Python may be needed to build it.

---

## Contributing & security

puente is open source (MIT). Contributions are welcome — see
[CONTRIBUTING.md](https://github.com/pauldvlp/puente/blob/main/CONTRIBUTING.md).
Found a vulnerability? Please report it privately per our
[Security Policy](https://github.com/pauldvlp/puente/blob/main/SECURITY.md).

Source & issues: **https://github.com/pauldvlp/puente**

---

MIT © [pauldvlp](https://github.com/pauldvlp)
