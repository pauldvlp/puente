# Changelog

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
