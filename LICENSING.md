# Licensing

puente is **open core**. Two licenses live in this repository, and which one applies depends on
which directory a file is in.

| Path                                          | License                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| Everything, unless listed below               | [AGPL-3.0-or-later](./LICENSE)                       |
| `apps/server/src/ee/**`, `apps/web/src/ee/**` | [puente Commercial License](./LICENSE-COMMERCIAL.md) |

Copyright © 2026 Paul Barahona.

## puente Community — AGPL-3.0-or-later

The whole product, minus the `ee/` directories, is free software under the GNU Affero General
Public License, version 3 or later. You may run it, read it, change it and redistribute it, for
any purpose including commercial use, as long as you keep it under the same license.

The A in AGPL matters here: if you modify puente and let other people use it **over a network**,
section 13 requires you to offer those users the source of your modified version. Running an
unmodified puente for yourself, your company or your clients triggers nothing — that is just using
the software, and it is explicitly fine.

Community has no node limit, no route limit, no time limit and no telemetry. It is not a trial.

## puente Pro — puente Commercial License

Files under `ee/` implement the paid edition (team accounts and roles, SSO, exportable audit log,
scheduled backups, alerting, multi-account workspaces). They are **source-available, not open
source**: you can read them, audit them and patch them for your own licensed deployment, but
running them requires a valid license key, and redistribution is not permitted.

Buy a license: email **johanpaulbarahona@gmail.com** — see the edition comparison in the
[README](./README.md#editions).

## Which one do I need?

You need a **commercial license** if you want to:

- run the Pro features (the software will tell you — they are inert without a key), or
- ship puente, modified or not, as part of a **closed-source** product or a hosted service without
  releasing your changes under the AGPL.

You need **nothing but the AGPL** if you:

- run puente to manage your own infrastructure, at home or at work;
- run puente to manage **your clients'** infrastructure as an agency or MSP;
- fork it, patch it and keep the patches to yourself;
- fork it, patch it and publish your fork under the AGPL.

## For contributors

Contributions are welcome and are accepted under the terms in [CLA.md](./CLA.md), which lets this
dual-licensing model keep working. In short: you keep the copyright on what you write, and you
grant the maintainer the right to license it under both licenses above.

## History

puente was released under the MIT license up to and including version 0.2.0. Those releases stay
MIT forever — a license grant, once given, cannot be revoked. Version 0.3.0 onwards is AGPL-3.0.
