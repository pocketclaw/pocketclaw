# Contributing to PocketClaw

First off — thanks for considering contributing! This project was born from pure stubbornness and a $0 phone. Every improvement helps someone turn their old phone into something useful.

## Ways to Contribute

### Got it running on a different phone?

We'd love to hear about it! Open an issue with:
- Phone model and year
- Android version
- RAM amount
- Which hacks you needed (and which you didn't)
- Any new issues you hit

This helps us build a compatibility table and improve the guide.

### Found a better hack?

If you found a cleaner solution to any of the [55 hacks](HACKS.md), open a PR! Include:
- Which hack it replaces or improves
- Why the new approach is better
- What you tested it on

### Want to add another AI provider?

Kimi K2.5 isn't the only free option. If you got another provider working:
1. Document the provider config for `openclaw.json`
2. Note any special headers or auth requirements
3. Include the free tier limits (context window, rate limits, cost)

### Found a bug?

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). The more details, the better — especially logs and your phone specs.

## Pull Request Process

1. **Fork the repo** and create your branch from `main`
2. **Test on actual hardware** if possible (the whole point is old phones)
3. **Update docs** — if you change config format or scripts, update README.md and the relevant examples
4. **Keep it simple** — this project runs on 1GB RAM devices. Don't add heavy dependencies
5. **One thing per PR** — easier to review, easier to merge

## Code Style

This project is mostly shell scripts and config files. Keep it readable:

- Shell scripts: use `#!/data/data/com.termux/files/usr/bin/bash` for Termux scripts
- Comments: explain *why*, not *what* (the code shows what)
- Config: keep `openclaw.example.json` in sync with any config changes

## Commit Messages

Keep them short and descriptive:
- `fix: resolve IPv6 DNS fallback on Android 7+`
- `feat: add Groq provider config`
- `docs: add Samsung Galaxy S5 to tested devices`

## Questions?

Open an issue tagged `question`. No question is too basic — if you're stuck getting an old phone to run AI, you're already doing something impressive.

---

**Remember:** if it runs on a Moto E2 from 2015, it runs on anything. Every contribution makes that easier for the next person.
