# Changelog

## [0.3.0](https://github.com/pauldvlp/puente/compare/v0.2.0...v0.3.0) (2026-08-21)


### ⚠ BREAKING CHANGES

* **license:** the license changes from MIT to AGPL-3.0-or-later. Anyone redistributing a modified puente, or offering one over a network, now has source-sharing obligations they did not have before. Running it — for yourself, your company or your clients — requires nothing.

### ✨ Features

* **alerts:** tell someone when a node or a route breaks ([34bd190](https://github.com/pauldvlp/puente/commit/34bd190576929875483fceed54991fa42bb6fa39))
* **license:** dual-license under AGPL-3.0 with a commercial Pro edition ([ae57cb8](https://github.com/pauldvlp/puente/commit/ae57cb8c6edf6de44e6f806d3000e0550778041d))
* **license:** verify Pro license keys offline and gate the paid edition ([5938055](https://github.com/pauldvlp/puente/commit/5938055320ecd2864183b15022b01efe6c643555))
* **workspaces:** move the Cloudflare connection onto a workspace ([fc6a055](https://github.com/pauldvlp/puente/commit/fc6a055e6f17100558aa48547e9903654472cdb1))


### 🐛 Bug Fixes

* **cli:** report the version npm actually published ([fdeb356](https://github.com/pauldvlp/puente/commit/fdeb3568a24fe4da7406eb909533d4cac4d900a2))
* **deps:** bump the npm group across 1 directory with 5 updates ([cb02803](https://github.com/pauldvlp/puente/commit/cb0280308eb163fb37e35f35283c1b38f05faef7))
* **license:** stop pointing the upgrade button at a domain we do not own ([6f3f6f3](https://github.com/pauldvlp/puente/commit/6f3f6f3165a8365269327774e65a3f38f3ede781))

## [0.2.0](https://github.com/pauldvlp/puente/compare/v0.1.3...v0.2.0) (2026-08-13)


### ⚠ BREAKING CHANGES

* **cli:** `puente start` no longer stays attached to the terminal. Anything that owns the process lifetime — Docker, systemd, CI — must pass `--foreground`. The bundled Dockerfile and the Playwright webServer already do.

### ✨ Features

* **cli:** run the panel in the background by default ([22e05db](https://github.com/pauldvlp/puente/commit/22e05db1990441b32041c97c9152659719847b0d))

## [0.1.3](https://github.com/pauldvlp/puente/compare/v0.1.2...v0.1.3) (2026-08-13)


### 🐛 Bug Fixes

* **deps:** bump the npm group across 1 directory with 23 updates ([c006344](https://github.com/pauldvlp/puente/commit/c0063442c16c3b6bdfc9f637d3239831ce9ebd08))

## [0.1.2](https://github.com/pauldvlp/puente/compare/v0.1.1...v0.1.2) (2026-07-23)


### 🐛 Bug Fixes

* assert a deleted tunnel by absence from the live list, not a 404 ([2bb2852](https://github.com/pauldvlp/puente/commit/2bb2852c3351580a268ac0ec159687c61036d8cb))

## [0.1.1](https://github.com/pauldvlp/puente/compare/v0.1.0...v0.1.1) (2026-07-16)


### 📝 Documentation

* guide pnpm users past the native build-script prompt ([5d433a2](https://github.com/pauldvlp/puente/commit/5d433a2b441156116ad26294005abdc5b712bb7a))
