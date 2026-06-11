# Market Bubble Live Setup Guide

Last updated: 2026-06-11

This guide is for anyone setting up, operating, or reviewing the Market Bubble Live Chat demo. It explains the moving pieces, required credentials, environment variables, and expected operating flow.

## What The Product Does

Market Bubble Live Chat creates one shared live room from:

- Twitch chat
- Kick chat
- X livechat capture
- native Market Bubble chat

The public viewer sees a single live hub. The operator sees a protected admin dashboard. X capture runs separately so viewers are never asked to open X, install extensions, or approve browser popups.

## System Architecture

```text
Viewers
  open /live or an iframe embed
  read combined chat
  send native Market Bubble messages

Render public app
  serves /live, /embed, /mock-marketbubble
  stores recent messages in memory
  receives Twitch/Kick/X/native chat
  exposes protected admin dashboard

Twitch
  uses OAuth + EventSub WebSocket

Kick
  uses OAuth/app credentials + webhook events

X
  uses an operator-side capture agent
  capture agent posts to /api/capture/x-live
```

## Main URLs

Current demo host:

```text
https://marketbubble-live-chat.onrender.com
```

Public routes:

```text
/live
/embed
/embed?view=chat
/mock-marketbubble
/api/public/config
```

Admin route:

```text
/
```

Admin requires `ADMIN_PASSWORD`.

## Render Setup

Render deploys from GitHub:

```text
JessexBrown/ls-chat
branch: main
```

Build command:

```bash
npm ci --include=dev && npm run build
```

Start command:

```bash
npm start
```

Health check:

```text
/api/public/config
```

The repo includes:

```text
render.yaml
docs/render-deployment.md
```

## Required Render Environment Variables

Core:

```bash
NODE_ENV=production
PUBLIC_LIVE_ONLY=false
DEMO_CHAT_ENABLED=false
DEMO_CHAT_FORCE=false
ADMIN_PASSWORD=<strong operator password>
ADMIN_SESSION_SECRET=<generated secret>
NATIVE_CHAT_SESSION_SECRET=<generated secret>
```

Embedding:

```bash
EMBED_ALLOWED_ORIGINS=https://marketbubble.com,https://www.marketbubble.com
```

For the current Render demo URL, the app can still be opened directly. When embedding inside the real Market Bubble site, make sure the Market Bubble domains stay in `EMBED_ALLOWED_ORIGINS`.

Native chat:

```bash
NATIVE_CHAT_SESSION_COOKIE=mb_native_guest
NATIVE_CHAT_SESSION_MAX_AGE_SECONDS=2592000
NATIVE_CHAT_SESSION_SAME_SITE=lax
NATIVE_CHAT_RATE_LIMIT=8
NATIVE_CHAT_RATE_WINDOW_MS=10000
```

If embedding cross-site from a non-Market-Bubble domain, use:

```bash
NATIVE_CHAT_SESSION_SAME_SITE=none
```

Only use `none` over HTTPS.

## Twitch Setup

Render env:

```bash
TWITCH_CLIENT_ID=<Twitch app client id>
TWITCH_CLIENT_SECRET=<Twitch app client secret>
TWITCH_REDIRECT_URI=https://marketbubble-live-chat.onrender.com/api/auth/twitch/callback
TWITCH_OAUTH_SCOPES=user:read:chat
TWITCH_EVENTSUB_ENABLED=false
TWITCH_BROADCASTER_USER_ID=<optional default broadcaster id>
TWITCH_EVENTSUB_SECRET=<generated secret>
```

Twitch Developer Console must include this redirect URL:

```text
https://marketbubble-live-chat.onrender.com/api/auth/twitch/callback
```

Operator flow:

1. Open admin `/`.
2. Go to Source Settings.
3. Connect Twitch OAuth.
4. Add/subscribe the desired broadcaster.
5. Confirm messages appear on `/live`.

## Kick Setup

Render env:

```bash
KICK_CLIENT_ID=<Kick app client id>
KICK_CLIENT_SECRET=<Kick app client secret>
KICK_REDIRECT_URI=https://marketbubble-live-chat.onrender.com/api/auth/kick/callback
KICK_WEBHOOK_URL=https://marketbubble-live-chat.onrender.com/api/webhooks/kick
KICK_OAUTH_SCOPES=events:subscribe channel:read
KICK_PUBLIC_KEY_PEM=<Kick public key PEM without surrounding quotes>
KICK_INGESTION_ENABLED=true
KICK_AUTO_SUBSCRIBE=false
```

Kick Developer Console:

```text
Redirect URL: https://marketbubble-live-chat.onrender.com/api/auth/kick/callback
Webhook URL:  https://marketbubble-live-chat.onrender.com/api/webhooks/kick
```

Important PEM note:

```text
Paste the PEM value without surrounding .env quotes.
```

Valid shape:

```text
-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----
```

Do not include:

```text
"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Operator flow:

1. Open admin `/`.
2. Go to Source Settings.
3. Connect Kick OAuth.
4. Subscribe to the target channel.
5. Open `/api/public/config`.
6. Check:

```text
kickWebhook.diagnostics.received
kickWebhook.diagnostics.accepted
kickWebhook.diagnostics.invalidSignature
kickWebhook.diagnostics.broadcasterNotTracked
```

Healthy:

```text
received > 0
accepted > 0
invalidSignature = 0
```

If `broadcasterNotTracked` increases, Kick is sending messages for a different broadcaster than the app is tracking.

## X Setup

Render env:

```bash
X_LIVE_CHAT_WORKER_AUTO_START=false
X_LIVE_CHAT_TARGETS=blknoiz06,Banks
X_LIVE_CAPTURE_TOKEN=<generated shared token>
X_LIVE_CAPTURE_ALLOWED_ORIGINS=https://x.com,https://twitter.com,https://mobile.x.com
X_LIVE_CAPTURE_ALLOW_EXTENSION_ORIGINS=true
```

The public Render app should never launch Chrome. Keep:

```bash
X_LIVE_CHAT_WORKER_AUTO_START=false
```

Operator capture machine env:

```powershell
$env:X_LIVE_CAPTURE_ENDPOINT="https://marketbubble-live-chat.onrender.com/api/capture/x-live"
$env:X_LIVE_CAPTURE_TOKEN="<same token from Render>"
$env:X_LIVE_CHAT_TARGETS="blknoiz06,Banks"
```

Start capture:

```powershell
npm run capture:x
```

Dry run:

```powershell
$env:X_CAPTURE_AGENT_DRY_RUN="true"
npm run capture:x
Remove-Item Env:\X_CAPTURE_AGENT_DRY_RUN
```

Expected:

- Chrome opens or attaches to the capture profile
- X livechat pages open
- operator signs into X if prompted
- terminal prints posted X message batches
- `/live` shows platform `X` messages

## Native Market Bubble Chat Setup

Native chat does not require third-party credentials.

It needs:

```bash
NATIVE_CHAT_SESSION_SECRET=<long random secret>
```

Viewers receive a signed guest identity stored in an HttpOnly cookie. The public composer does not let unauthenticated users choose arbitrary names.

Current moderation support:

- hide native message
- mute native guest for current server runtime
- network/browser-key hardening against simple cookie clearing

Production gap:

- durable user accounts and database-backed moderation are still needed for long-term production.

## Website Embedding

Full hub iframe:

```html
<iframe
  src="https://marketbubble-live-chat.onrender.com/embed"
  title="Market Bubble Live"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  style="width: 100%; height: 760px; border: 0; display: block;"
></iframe>
```

Chat-only iframe:

```html
<iframe
  src="https://marketbubble-live-chat.onrender.com/embed?view=chat"
  title="Market Bubble Shared Chat"
  style="width: 100%; height: 640px; border: 0; display: block;"
></iframe>
```

Recommended production host:

```text
https://live.marketbubble.com
```

Recommended production embed target:

```text
https://marketbubble.com
```

## Common Operations

Redeploy:

```text
Render Dashboard -> Service -> Manual Deploy -> Deploy latest commit
```

Check public health:

```text
https://marketbubble-live-chat.onrender.com/api/public/config
```

Check retained messages:

```text
https://marketbubble-live-chat.onrender.com/api/messages
```

Check admin auth:

```text
https://marketbubble-live-chat.onrender.com/api/operator-auth/status
```

Expected when not logged in:

```json
{
  "required": true,
  "authenticated": false
}
```

## Demo Readiness Checklist

Before presenting:

1. Render service is awake.
2. `/live` loads.
3. `/embed` loads.
4. `/mock-marketbubble` loads.
5. Admin login works.
6. Twitch messages appear.
7. Kick messages appear.
8. X capture agent is running.
9. X messages appear.
10. Native Market Bubble chat message sends successfully.

## Known Production Gaps

These do not block the demo, but they should be planned before a real launch:

- move X capture from a laptop to a dedicated capture machine
- add durable message storage
- add durable moderation storage
- add account-backed Market Bubble identity
- add Redis/database rate limits for multi-instance deployments
- add observability/logging dashboards
- choose final domain strategy
- confirm iframe/cookie behavior on the real Market Bubble website
