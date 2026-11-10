# Changelog

PocketClaw never published tagged releases. The version names below (v0 to v9) are the internal iterations used during the February 2026 experiment, reconstructed from the git history.

## 2026-11-10: Repository refresh

No new features. Documentation and safety fixes only.

- README: notice that PocketClaw is now [pocketclaw.dev](https://pocketclaw.dev), honest project status (experiment, best-effort), install paths that match the scripts, known limits.
- Pin OpenClaw to `2026.2.12` in `install.sh` and in the docs. Unpinned installs now pull releases that require Node.js 24.16+ and cannot run on this setup.
- `setup.sh`: fix the Termux download for Android 7+ (the previous release URL returned 404).
- `scripts/hijack.js`: when `POCKETCLAW_TOKEN` is set, also require it on `/api/setup`, `/api/setup/debloat`, `/api/setup/launcher`, `/api/setup/harden` and `/api/modules/toggle`. Behavior without a token is unchanged.
- `config/env.example`: document `POCKETCLAW_TOKEN`.
- Launcher: fix a duplicate field (`flashRect`) that stopped `DashboardView.java` from compiling. The CI Java check did not catch it because its android.jar download returns 404 and the step is skipped; a fix is pending.
- Add `SECURITY.md`, `CHANGELOG.md`, `docs/github-metadata.md`. Shorter `CONTRIBUTING.md`.

## 2026-02-20: v9 "Ultra"

Last code change of the experiment.

- V8 heap 170 MB with a 6-hour restart cycle, semi-space 2 MB.
- WiFi watchdog stability, patched daemon stopper, on-screen keyboard removed.
- Docs translated to English, repository moved to the `pocketclaw` GitHub organization.

## 2026-02-16 to 2026-02-19: v6 to v8

- Native Node.js 22.12.0 cross-compiled with the NDK, LD_PRELOAD API 23 shim, proot removed from the runtime path.
- Lazy loading through Proxy (37 package prefixes), dead stubs for unused providers.
- Hybrid native launcher with Canvas dashboard, wake lock and Doze bypass, Dalvik-free operation via `setsid`.
- Single gateway process, PID file against duplicate instances, fully autonomous boot.

## 2026-02-11 to 2026-02-15: v0 to v5

- First working OpenClaw gateway on a Moto E2 (1 GB RAM, Android 6) under proot.
- Debloat from 144 to 13 packages, SystemUI removed.
- Initial open-source release with the hack log (HACKS.md).
