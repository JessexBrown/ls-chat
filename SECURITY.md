# Security And Operations Notes

Last updated: 2026-06-11

This project is currently a demo-ready MVP, not a fully hardened production community platform. The notes below are intended to help reviewers understand the current security posture and the remaining launch work.

## Secrets

Do not commit real secrets or generated session files.

Ignored local files include:

- `.env`
- `.env.*`
- `.data/`
- `dist/`
- `node_modules/`
- `*.log`
- `*.pid`

Use `.env.example` as the public reference for required configuration.

## Admin Access

The operator dashboard is served at `/`.

For any public deployment:

- Set `ADMIN_PASSWORD`.
- Set a strong `ADMIN_SESSION_SECRET`.
- Confirm admin write requests include CSRF protection.
- Keep `/api/health`, source settings, OAuth, runtime config, and mock ingestion behind operator auth.

For viewer-only deployments, use `PUBLIC_LIVE_ONLY=true`. In that mode `/` redirects to `/live`, and admin/OAuth/settings APIs are disabled.

## Embedding

Restrict iframe hosts with `EMBED_ALLOWED_ORIGINS`.

Recommended values should include only Market Bubble and intentional partner domains, for example:

```text
https://marketbubble.com,https://www.marketbubble.com
```

Review cookie behavior before production embedding. Cross-site iframe deployments may require `SameSite=None` and HTTPS-only secure cookies.

## Native Chat

Native Market Bubble chat currently provides:

- signed guest sessions
- basic in-memory rate limiting
- admin hide controls
- runtime native guest mute controls

Production still needs:

- account-backed or otherwise durable identity
- database-backed moderation
- durable bans/mutes/timeouts
- duplicate message and blocked term controls
- link and spam controls
- audit logging for moderation actions
- shared rate limiting for multi-instance deployments

## X Capture

X broadcast livechat capture is an operator-side workaround.

For hosted demos:

- Set `X_LIVE_CAPTURE_TOKEN`.
- Keep `X_LIVE_CHAT_WORKER_AUTO_START=false` on the public Render app.
- Run `npm run capture:x` from a trusted operator machine or future dedicated capture host.
- Do not ask public viewers to open X tabs, install extensions, or run capture tooling.

## Platform Credentials

Twitch and Kick OAuth/session files are local operational secrets.

Expected ignored files:

- `.data/twitch-session.json`
- `.data/kick-session.json`
- `.data/live-session.json`
- `.data/x-live-chat-profile/`

Kick webhook verification depends on `KICK_PUBLIC_KEY_PEM`. On hosted providers, paste the PEM without surrounding `.env` quotes.

## Production Gaps To Resolve

Before a real public launch, prioritize:

- durable storage for messages, moderation, source events, and stats
- durable native user identity
- Redis/database/edge rate limiting
- structured logs and source-health metrics
- final iframe/CSP/cookie review on the real Market Bubble domain
- dedicated X capture host or official API replacement
- incident response and admin audit trails
