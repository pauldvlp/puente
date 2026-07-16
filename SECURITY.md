# Security Policy

puente manages Cloudflare API tokens, tunnel run-tokens, SSH credentials, and an
at-rest encryption key. We take its security seriously and appreciate responsible
disclosure.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use one of these private channels:

- **GitHub Security Advisories** — preferred:
  [Report a vulnerability](https://github.com/pauldvlp/puente/security/advisories/new)
- **Email** — johanpaulbarahona@gmail.com

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected version (`puente info`) and platform.

You can expect an initial acknowledgement within **72 hours**. We'll keep you
updated on remediation progress and coordinate a disclosure timeline with you.
Please give us a reasonable window to ship a fix before any public disclosure.

## Supported versions

puente is pre-1.0. Security fixes are applied to the **latest published version**.
Please upgrade to the newest release before reporting.

## Security model — what puente protects and how

- **Secrets at rest** (Cloudflare token, tunnel tokens) are encrypted with
  **AES-256-GCM**. The 256-bit master key is generated on first run and stored at
  `~/.puente/key` with `chmod 600`.
- **Admin password** is hashed with **scrypt**; sessions use signed JWTs whose
  secret lives at `~/.puente/jwt.secret`.
- **SSH**: passwordless bootstrap generates a dedicated `ed25519` key per host and
  installs it into the remote `authorized_keys`. Host keys are pinned on first use
  (TOFU). The bootstrap password is **never** persisted.
- **Network**: puente only talks to the Cloudflare API and the hosts you configure.
  There is **no telemetry** and no phone-home.

## Deployment guidance

- The panel has no built-in TLS. **Do not expose the panel port (default `5006`)
  directly to the internet.** Run it on localhost, behind a VPN, on a trusted LAN,
  or — fittingly — behind a Cloudflare Tunnel with Access in front of it.
- Treat `~/.puente/` as highly sensitive. Anyone with read access to it can decrypt
  your stored tokens. Back it up securely and keep filesystem permissions tight.
- Use a **least-privilege** Cloudflare API token with only the four scopes puente
  documents — not a Global API Key.
