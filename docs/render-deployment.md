# Render Deployment

Last updated: 2026-06-11

This app is ready to deploy as a Render Web Service. Render web services provide a public URL, TLS, environment variables, custom domains, health checks, and WebSocket support. The app binds to Render's `PORT` on `0.0.0.0` and trusts Render proxy headers so generated public URLs and secure cookies use HTTPS.

## Recommended Demo Shape

Use Render for the public app:

```text
https://marketbubble-live-chat.onrender.com/live
https://marketbubble-live-chat.onrender.com/embed
https://marketbubble-live-chat.onrender.com/embed?view=chat
```

Run X capture separately from a trusted operator machine:

```text
npm run capture:x
```

Public visitors should never be asked to open X tabs, approve popups, install an extension, or authenticate with X.

## Render Setup

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from the repo, or create a Web Service manually.
3. If using the Blueprint, Render reads `render.yaml`.
4. Build command:

```bash
npm ci --include=dev && npm run build
```

5. Start command:

```bash
npm start
```

6. Health check path:

```text
/api/public/config
```

## Required Env Values To Fill In Render

Render will prompt for `sync: false` values from `render.yaml`. Fill these after you know the Render service URL.

```bash
ADMIN_PASSWORD=<strong operator password>

TWITCH_CLIENT_ID=<from Twitch Developer Console>
TWITCH_CLIENT_SECRET=<from Twitch Developer Console>
TWITCH_REDIRECT_URI=https://<render-service-host>/api/auth/twitch/callback

KICK_CLIENT_ID=<from Kick Developer Console>
KICK_CLIENT_SECRET=<from Kick Developer Console>
KICK_REDIRECT_URI=https://<render-service-host>/api/auth/kick/callback
KICK_WEBHOOK_URL=https://<render-service-host>/api/webhooks/kick
KICK_PUBLIC_KEY_PEM=<Kick public key PEM>
```

The Blueprint generates these automatically:

```bash
ADMIN_SESSION_SECRET
NATIVE_CHAT_SESSION_SECRET
TWITCH_EVENTSUB_SECRET
X_LIVE_CAPTURE_TOKEN
```

Copy `X_LIVE_CAPTURE_TOKEN` from Render into the capture machine environment before running `npm run capture:x`.

## Developer Console Updates

After the first Render deploy creates the public URL, update platform dashboards:

Twitch Developer Console:

```text
https://<render-service-host>/api/auth/twitch/callback
```

Kick Developer Console:

```text
Redirect URL: https://<render-service-host>/api/auth/kick/callback
Webhook URL:  https://<render-service-host>/api/webhooks/kick
```

## X Capture Machine

On the operator machine:

```bash
X_LIVE_CAPTURE_ENDPOINT=https://<render-service-host>/api/capture/x-live
X_LIVE_CAPTURE_TOKEN=<same token from Render>
X_LIVE_CHAT_TARGETS=blknoiz06,Banks
X_LIVE_CHAT_CHROME_PATH=<optional browser executable path>
npm run capture:x
```

Dry-run validation:

```bash
X_CAPTURE_AGENT_DRY_RUN=true npm run capture:x
```

The dry run should show two targets:

```text
https://x.com/blknoiz06/livechat
https://x.com/Banks/livechat
```

## Demo Verification

After deploy:

1. Open `/api/public/config` and confirm `fullEmbedUrl`, `chatEmbedUrl`, and `streamSources` are present.
2. Open `/live` and confirm the stream, combined chat, viewer count, and source dropdown render.
3. Open `/embed` and `/embed?view=chat`.
4. Open `/mock-marketbubble` to show the product embedded into a Market Bubble-style page.
5. Log into `/` with `ADMIN_PASSWORD`.
6. Use Twitch OAuth and subscribe to `fazebanks`.
7. Use Kick OAuth and subscribe to `ansem`.
8. Start the X capture agent and confirm X messages arrive as platform `X`.
9. Send a native Market Bubble message and refresh to confirm the guest identity remains stable.

## Notes

- `PUBLIC_LIVE_ONLY=false` in the Blueprint so the protected admin dashboard remains available for the demo. Set it to `true` later for an adminless public-only deployment.
- The Blueprint uses Render's `free` plan to avoid accidental cost. Upgrade for stakeholder demos if cold starts are unacceptable.
- OAuth session files are stored on the service filesystem and can be lost on redeploys or restarts without a persistent disk. Re-run OAuth after deploys when needed.
- Keep `X_LIVE_CHAT_WORKER_AUTO_START=false` on Render. X browser capture belongs on the operator capture machine, not the public app server.
