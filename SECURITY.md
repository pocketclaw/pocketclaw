# Security Policy

## Scope

This policy covers the code in this repository: the install and boot scripts, `scripts/hijack.js` (dashboard and runtime patches), the launcher APK sources and the tools.

It does not cover the AI agents PocketClaw runs or writes about. For OpenClaw, Hermes Agent, Nanobot, NanoClaw, IronClaw, ZeroClaw, Moltworker and others:

- report vulnerabilities to the agent's own maintainers, using their security policy;
- see the known ones in the tracker at **[pocketclaw.dev/cves](https://pocketclaw.dev/cves)**.

## Supported versions

PocketClaw is an experiment from February 2026 maintained on a best-effort basis. Only the `main` branch is considered. There are no supported releases and no guaranteed fix times.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository (**Security** tab, **Report a vulnerability**). If that is not available, open a minimal public issue asking for a private contact, without details.

Include what is affected, how to reproduce it, and what an attacker gains. We will acknowledge reports when we can and say plainly if something will not be fixed.

## Known issues

These are documented, not hidden. Read them before running the project.

- **Pinned OpenClaw with published advisories.** The project runs OpenClaw 2026.2.12 (originally 2026.2.9). The GitHub Advisory Database lists OpenClaw versions up to 2026.6.6-beta.2 as affected by critical advisories, and its 2026.2.x dependency tree has further high and critical advisories (for example in `tar`, `simple-git` and `ws`). Newer OpenClaw releases need Node.js 24.16+, which the Android 6 build cannot provide, so the pin cannot be lifted without breaking the setup.
- **Node.js 22.12.0.** Both installation paths use Node.js 22.12.0, which predates several Node.js security releases.
- **Dashboard open by default.** The dashboard API on port 9000 is reachable from the local network. Without `POCKETCLAW_TOKEN`, it is unauthenticated, including endpoints that change API keys, restart the gateway or run the debloat. With a token, the mutating endpoints require it, but read-only endpoints (status, logs, heap, modules) stay open.
- **Deliberately weakened device.** The Android 6 path uses Dirty COW (CVE-2016-5195, `tools/dirtycow.c`) on the owner's phone, and the device no longer receives Android security updates.

Recommended use: a dedicated phone, a trusted network, a dedicated Telegram bot, provider keys with a spending limit, and `POCKETCLAW_TOKEN` set.
