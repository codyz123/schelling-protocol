# YouTube Upload Policy

**Previous account was banned for TOS violation (automated public uploads from unverified app).**

## Rules — ALWAYS follow these:

1. **Always upload as PRIVATE** — never use `--public`. Cody manually publishes.
2. **One upload per cron run** — never batch multiple uploads in a single session.
3. **No rapid succession** — the daily cron runs once at midnight. Don't retry or queue.
4. **Keep the app in "In Production" status** on Google Cloud Console (not "Testing").
5. **Don't re-auth or create new OAuth clients without Cody's approval.**
6. **If upload fails, log the error and skip** — don't retry in a loop.
7. **Video content**: always include human-readable descriptions, not auto-generated spam.

## Credentials
- Account: theschellingprotocol@gmail.com
- GCP Project: project-25551573-c0b4-4a1c-962
- OAuth Client: 524991053553-*.apps.googleusercontent.com
- Creds file: .youtube-credentials.json (gitignored)
