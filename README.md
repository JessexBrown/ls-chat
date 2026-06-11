# Market Bubble Live Chat

Last updated: 2026-06-11

Market Bubble Live Chat is a unified live hub for combining chat from Twitch, Kick, X broadcast livechat capture, and Market Bubble's native first-party chat into one shared viewer experience.

The project is currently built as a demo-ready MVP for Market Bubble. It is meant to show the product direction clearly: Market Bubble can own the main live destination while external platforms become inputs and optional stream playback sources.

## What This Application Does

The app has two major audiences.

Public viewers use `/live`, `/embed`, or `/embed?view=chat` to watch a stream, switch between available stream sources, read one combined chat, and post into the native Market Bubble room.

Operators use `/` to connect/manage sources, monitor chat, inspect stats, configure live-session defaults, and moderate native Market Bubble messages.

Current chat sources:

- Twitch chat through OAuth and EventSub WebSocket.
- Kick chat through OAuth/app credentials and Kick webhooks.
- X broadcast chat through an operator-side browser capture agent.
- Market Bubble native chat through the public viewer page.

Current stream source behavior:

- The public viewer page can expose a primary Market Bubble stream feed plus tracked Twitch/Kick/X-related source options.
- Viewers can choose the playback source they prefer while staying in the same shared Market Bubble chat.
- The stream frame includes reload/open controls because embedded platform players can be interrupted by provider behavior, ads, autoplay rules, or session state.

## Current Feature Set

### Public Viewer Hub

- `/live` provides the full public stream-plus-chat experience.
- `/embed` provides an iframe-friendly full hub.
- `/embed?view=chat` provides a chat-only iframe for pages that already own the video layout.
- `/mock-marketbubble` is a proof page showing how the product can sit inside a Market Bubble-style website.
- Public preferences let viewers change theme, row density, label visibility, emote visibility, and BetterTTV visibility.
- Native Market Bubble chat assigns a signed guest identity instead of letting unauthenticated users type arbitrary names.
- Combined viewer count and source breakdowns are exposed from the source snapshot pipeline.

### Operator/Admin Dashboard

- `/` is the operator console.
- Optional `ADMIN_PASSWORD` protects the dashboard and admin APIs.
- Twitch OAuth can connect an operator account and subscribe to tracked broadcaster chat.
- Kick OAuth can connect an operator account and subscribe to tracked broadcaster webhook events.
- X source controls exist, but production/demo X broadcast capture is expected to run from a trusted operator machine.
- Admin stats show retained messages, unique chatters, recent messages per minute, platform breakdowns, source breakdowns, and top retained chatters.
- Native Market Bubble moderation can hide retained native messages and mute native guest identities for the current server runtime.
- Website Install shows iframe snippets, readiness checks, and demo links.

### Message Pipeline

- All sources normalize into the shared `ChatMessage` contract.
- The server keeps a bounded recent message window controlled by `CHAT_HISTORY_LIMIT`.
- Messages are broadcast to clients over WebSocket.
- Message source metadata preserves both platform and origin channel/source.
- Twitch platform emote fragments and BetterTTV lookup support are wired into the display path.

### Deployment Support

- Render deployment is supported through `render.yaml`.
- Public-only mode is available with `PUBLIC_LIVE_ONLY=true`.
- Public-only mode redirects `/` to `/live` and disables admin/OAuth/settings APIs.
- Embed origins can be restricted with `EMBED_ALLOWED_ORIGINS`.

## Important Routes

```text
/                         Operator/admin dashboard
/live                     Public viewer hub
/embed                    Full iframe hub
/embed?view=chat          Chat-only iframe
/mock-marketbubble        Market Bubble proof page
/api/public/config        Public configuration and install metadata
/api/messages             Retained normalized messages
/api/sources              Current source/viewer snapshot
/api/health               Protected admin health/config snapshot
/api/webhooks/kick        Kick webhook ingress
/api/capture/x-live       X livechat capture ingress
/ws                       Realtime message/source WebSocket
```

## Quick Start

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:4200/
http://localhost:4200/live
http://localhost:4200/embed
http://localhost:4200/mock-marketbubble
```

Build and verify:

```bash
npm run verify
```

`npm run verify` runs Vitest and the production build.

## Available Scripts

```text
npm run dev             Start the app server with Vite middleware
npm run dev:watch       Restart the server while editing server code
npm run test            Run Vitest once
npm run test:watch      Run Vitest in watch mode
npm run typecheck       Run TypeScript without emitting files
npm run build           Build client and server for production
npm run start           Start the production server from dist
npm run capture:x       Run the operator-side X livechat capture agent
npm run verify          Run tests and production build
```

## Project Map

```text
src/client/
  App.tsx                Main React application and route-level UI
  styles.css             Shared admin/public styling and responsive layout

src/server/
  index.ts               Express server, routes, WebSocket fanout, integration orchestration
  adapters/              Platform payload normalizers
  security.ts            Kick signature verification and related request security helpers
  operatorAuth.ts        Admin auth and CSRF route rules
  publicOnlyMode.ts      Public-only route allow/deny behavior
  publicDashboard.ts     Public config and dashboard install helpers
  liveSession.ts         Live session persistence
  xLiveCapture.ts        X livechat capture ingestion helpers
  xLiveCaptureAgent.ts   Operator-side browser capture runner

src/shared/
  chat.ts                Shared ChatMessage, source, viewer, and platform schemas
  betterTtv.ts           BetterTTV token expansion helpers
  preferences.ts         Viewer chat preference defaults and persistence helpers

docs/
  application-scope.md                  Scope, expectations, and constraints
  development-roadmap.md                Original phased roadmap
  integration-contract.md               Shared message contract and ingress endpoints
  marketbubble-live-hub.md              Product vision and current implementation slice
  real-chat-setup.md                    Platform credential and local setup details
  kick-webhook-hosting.md               Kick public webhook URL guidance
  x-live-capture.md                     X livechat workaround notes
  website-embed-install.md              Iframe install snippets
  render-deployment.md                  Render deployment checklist
  stakeholder-setup-guide.md            Full setup and operating handoff
  demo-runbook.md                       Stakeholder demo script
  production-readiness-checklist.md     Functional and production readiness tests

extensions/x-live-capture/
  README.md              Optional browser-extension notes for X capture experiments
```

## Configuration Overview

Start from `.env.example`. Do not commit real `.env` values, OAuth sessions, or `.data/*` token files.

Core variables:

```text
PORT
PUBLIC_LIVE_ONLY
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
EMBED_ALLOWED_ORIGINS
CHAT_HISTORY_LIMIT
VIEWER_POLL_MS
DEMO_CHAT_ENABLED
DEMO_CHAT_FORCE
```

Market Bubble/native chat:

```text
MARKETBUBBLE_DASHBOARD_TITLE
MARKETBUBBLE_CHAT_LABEL
MARKETBUBBLE_STREAM_LABEL
MARKETBUBBLE_STREAM_EMBED_URL
MARKETBUBBLE_STREAM_WATCH_URL
LIVE_SESSION_FILE
NATIVE_CHAT_SESSION_SECRET
NATIVE_CHAT_RATE_LIMIT
NATIVE_CHAT_RATE_WINDOW_MS
```

Twitch:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
TWITCH_REDIRECT_URI
TWITCH_OAUTH_SCOPES
TWITCH_SESSION_FILE
TWITCH_EVENTSUB_ENABLED
TWITCH_EVENTSUB_SECRET
```

Kick:

```text
KICK_CLIENT_ID
KICK_CLIENT_SECRET
KICK_REDIRECT_URI
KICK_WEBHOOK_URL
KICK_OAUTH_SCOPES
KICK_PUBLIC_KEY_PEM
KICK_INGESTION_ENABLED
KICK_AUTO_SUBSCRIBE
KICK_SESSION_FILE
```

X livechat capture:

```text
X_LIVE_CHAT_TARGETS
X_LIVE_CAPTURE_ENDPOINT
X_LIVE_CAPTURE_TOKEN
X_LIVE_CAPTURE_ALLOWED_ORIGINS
X_LIVE_CHAT_WORKER_AUTO_START
X_LIVE_CHAT_CHROME_PATH
X_LIVE_CHAT_PROFILE_DIR
```

For full environment guidance, see `docs/stakeholder-setup-guide.md` and `docs/render-deployment.md`.

## Platform Integration Notes

### Twitch

Twitch is the cleanest current integration. The preferred flow is operator OAuth from the admin dashboard, then subscribing to one or more broadcaster chats. OAuth tokens are stored in `.data/twitch-session.json`.

Reviewer focus:

- Confirm Twitch OAuth redirect URL matches the deployment hostname.
- Confirm tracked broadcasters can be added and removed.
- Confirm `/live` chat receives Twitch messages without demo messages enabled.
- Confirm stream source switching does not reload the chat or destabilize the Twitch iframe.

### Kick

Kick uses OAuth/app credentials plus webhook delivery. The Kick Developer Console needs both a redirect URL and a webhook URL. `KICK_PUBLIC_KEY_PEM` verifies webhook signatures.

Reviewer focus:

- Confirm the PEM is stored without wrapping `.env` quotes on Render.
- Confirm invalid signatures produce admin-visible errors.
- Confirm stale webhook events for removed/untracked broadcasters are counted in diagnostics but do not turn the main Kick status red.
- Confirm removing a tracked Kick channel stops accepted messages from that channel.

### X

X broadcast livechat is not handled through a clean official broadcast chat API. The demo uses an operator-side capture agent that opens/attaches to browser pages for X livechat URLs and posts captured messages into `/api/capture/x-live`.

This is intentionally separated from public viewers:

- Public visitors should not be prompted to open X tabs.
- Public visitors should not install extensions.
- The capture agent should run from a trusted operator machine for the demo.
- Production should move this to a dedicated capture host or replace it if X exposes an official API path later.

Reviewer focus:

- Confirm `X_LIVE_CAPTURE_TOKEN` is required on hosted deployments.
- Confirm `/api/capture/x-live` rejects untrusted origins/tokens.
- Confirm X messages appear as platform `x` with clear source labels.
- Confirm the demo runbook explains that X capture is operational tooling, not a viewer workflow.

### Market Bubble Native Chat

Native chat is the long-term differentiator. External platform chats are inputs; Market Bubble native chat is the shared room the site owns.

Current behavior:

- Server-issued signed guest sessions.
- No arbitrary unauthenticated display-name field.
- Basic in-memory rate limiting.
- Admin hide/mute controls for native messages.
- Native messages flow through the same WebSocket and rendering pipeline as external messages.

Production gap:

- Account-backed identity is still needed.
- Durable moderation and persistent bans are still needed.
- Rate limiting should move to Redis/database/edge storage for multi-instance deployments.

## Demo Deployment

Current demo host:

```text
https://marketbubble-live-chat.onrender.com
```

Render uses:

```text
Build command: npm ci --include=dev && npm run build
Start command: npm start
Health check: /api/public/config
```

See:

- `docs/render-deployment.md`
- `docs/demo-runbook.md`
- `docs/stakeholder-setup-guide.md`

## Review Checklist

Use this list when reviewing whether the app is demo-ready.

### Core App

- `npm run verify` passes.
- `/live` loads without console errors.
- `/embed` and `/embed?view=chat` render without extra page chrome.
- `/mock-marketbubble` shows the product in a Market Bubble-style page.
- `/api/public/config` returns the expected public config.
- `/ws` stays connected while messages arrive.

### Chat Aggregation

- Twitch messages appear with Twitch origin labeling.
- Kick messages appear with Kick origin labeling.
- X capture messages appear with X origin labeling.
- Market Bubble native messages appear with Market Bubble origin labeling.
- High-volume chat remains compact and readable.
- Scrolling up pauses chat movement, and jump-to-current returns to newest messages.

### Public Viewer UX

- Chat remains the primary focus beside or below the stream.
- Source switching is understandable on desktop and mobile.
- Preferences do not cover operational/admin controls on public pages.
- Public viewer preferences persist after refresh.
- Native composer uses assigned guest identity.
- Mobile layouts do not clip header controls or source controls.

### Admin UX

- Admin dashboard requires login when `ADMIN_PASSWORD` is set.
- Admin write requests include CSRF protection.
- Source Settings clearly separates Twitch, Kick, X, Market Bubble, and advanced runtime settings.
- Stats are readable on desktop and mobile.
- Native moderation actions are visible only where appropriate.

### Security/Production

- Real secrets are not committed.
- `.data/*` session files are ignored.
- `EMBED_ALLOWED_ORIGINS` is limited to Market Bubble and intentional partners.
- `X_LIVE_CAPTURE_TOKEN` is set for hosted capture ingestion.
- Native chat rate limits are appropriate for a demo.
- Admin routes are not exposed without auth in a public deployment.

## Current Known Limitations

- X broadcast livechat capture is a workaround, not a first-class X API integration.
- The X capture agent must run from a trusted operator machine or future dedicated capture host.
- Retained messages, stats, native mutes, and moderation data are in-memory for the current server runtime.
- Native Market Bubble chat does not yet have account-backed identity.
- Multi-instance deployments need shared storage for rate limits, moderation, sessions, and analytics.
- Embedded Twitch/Kick players can pause or interrupt themselves due to provider behavior, browser policies, ads, or session state. The app provides reload/open controls and avoids unnecessary iframe remounts, but cannot fully control third-party player behavior.
- BetterTTV support depends on exact text-token matching and available BetterTTV channel/global emote data.
- Kick and Twitch viewer counts depend on polling and available platform data.
- X viewer count remains unknown until a reliable source is implemented.

## Things Being Improved

Near-term product/engineering improvements:

- Dedicated capture-host strategy for X livechat.
- Stronger production identity for Market Bubble native users.
- Database-backed message history, moderation, mutes, and analytics.
- More complete native moderation: delete, timeout, ban, held messages, blocked terms, duplicate-message controls, and link controls.
- Better observability for source health, webhook failures, WebSocket fanout, and native chat failures.
- More robust platform emote rendering, especially Kick emotes and channel-specific BetterTTV coverage.
- Final Market Bubble production domain and iframe/cookie strategy.
- Better event/session model if Market Bubble needs multiple named shows instead of one global live room.
- Ongoing UI polish for the public hub, admin dashboard, stats, and embed modes.

## Recommended Reviewer Path

1. Read this README.
2. Read `docs/marketbubble-live-hub.md` for product vision.
3. Read `docs/stakeholder-setup-guide.md` for setup and credentials.
4. Read `docs/demo-runbook.md` for the actual presentation flow.
5. Run `npm run verify`.
6. Open `/live`, `/embed`, `/mock-marketbubble`, and `/`.
7. Review `src/shared/chat.ts` to understand the message contract.
8. Review `src/server/index.ts` to understand ingestion, WebSocket fanout, and route wiring.
9. Review `src/client/App.tsx` and `src/client/styles.css` for UI behavior.
10. Use `docs/production-readiness-checklist.md` as the deeper QA checklist.

## Product Direction

The strategic direction is not just "show many chats in one box." The goal is to make Market Bubble the best place to watch and participate:

- Viewers choose the stream source they like.
- The shared Market Bubble chat remains central.
- Platform origin is clear but compact.
- Native Market Bubble identity and moderation become stronger over time.
- The website gains a live community layer that Twitch, Kick, and X cannot provide on their own.
