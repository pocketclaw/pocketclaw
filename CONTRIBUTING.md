# Contributing to PocketClaw

PocketClaw is a February 2026 experiment kept online on a best-effort basis. Contributions are welcome, but reviews can be slow and there is no roadmap.

The active project is [pocketclaw.dev](https://pocketclaw.dev) (hardware guide, CVE tracker for self-hosted agents). Its code is not in this repository.

## Useful contributions

- **Device reports.** Got it running, or failing, on another phone? Open an issue with the [phone report template](.github/ISSUE_TEMPLATE/phone_report.md): model, Android version, RAM, Termux, Node.js and OpenClaw versions, which hacks you needed.
- **Fixes to scripts or docs**, especially where the README no longer matches what happens on a real device.
- **Better hacks.** If you found a cleaner fix for one of the [57 hacks](HACKS.md), say which one, why it is better, and what you tested it on.

Security problems: see [SECURITY.md](SECURITY.md), not a public issue.

## Pull requests

1. Fork, branch from `main`, one change per PR.
2. Test on real hardware when the change touches the phone side, and say what you tested on. Do not claim results you did not measure.
3. Keep it light: this targets 1 GB devices, so no heavy dependencies.
4. Update the README or the example config when you change behavior.
5. Never commit API keys, bot tokens or `config/env`.

CI checks the JavaScript syntax. Its Java compile step is currently skipped (the android.jar download it relies on is gone), so compile the launcher locally against the Android 6.0 (API 23) platform if you change it.

## Style

- Termux scripts start with `#!/data/data/com.termux/files/usr/bin/bash`.
- Comments explain why, not what.
- Commit messages are short and descriptive, for example `fix: handle IPv6 DNS fallback`.
