# Market Bubble Live Chat

Market Bubble Live Chat is a unified live chat application for aggregating stream-adjacent messages from Twitch, Kick, X, and the native Market Bubble room into one operator-friendly chat surface.

The first development slice is intentionally narrow:

- normalize all platform payloads into one shared `ChatMessage` contract
- receive Twitch EventSub and Kick webhook payloads
- model official X API ingestion as public posts from Filtered Stream rules, with an experimental in-app livechat browser workaround for X broadcast chat
- broadcast normalized messages to the browser over WebSocket
- provide a polished realtime chat UI with platform filters, viewer preferences, and development mock ingestion

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:4200` for the operator desk, `http://localhost:4200/live` for the public Market Bubble viewer hub, `http://localhost:4200/embed` for the iframe-friendly website embed surface, or `http://localhost:4200/mock-marketbubble` for a proof page that shows the product inside a Market Bubble-style website.

`npm run dev` starts one stable server process. The React frontend still hot reloads through Vite middleware. Use `npm run dev:watch` only when actively changing server code and wanting automatic server restarts.

For an adminless viewer deployment, set `PUBLIC_LIVE_ONLY=true`. In that mode `/` redirects to `/live`, admin/OAuth/settings APIs are disabled, and the app expects stream/chat sources to be configured upfront through environment variables.

For a hosted demo, deploy the public app to Render with `render.yaml` and follow `docs/render-deployment.md`. X livechat capture should run from a trusted operator machine with `npm run capture:x`; public visitors should never be prompted to open X tabs or install capture tooling.

## Project Shape

```text
docs/
  application-scope.md       Product scope, expectations, and constraints
  admin-native-user-website-readiness.md
                              Admin, native identity, and production website plan
  demo-runbook.md            Presenter/operator script for stakeholder demos
  development-roadmap.md     Phased implementation plan
  integration-contract.md    Shared message contract and ingress endpoints
  kick-webhook-hosting.md    Public webhook URL and hosting options for Kick
  real-chat-setup.md         Real Twitch, Kick, and X ingestion setup
  render-deployment.md       Render Web Service deployment checklist
  stakeholder-setup-guide.md Setup handoff for credentials, Render, sources, and embeds
  website-embed-install.md   Copy-paste iframe install snippets for the website
  x-live-capture.md          Browser-assisted X broadcast chat workaround
src/
  client/                    React realtime chat UI
  server/                    Express/WebSocket server and platform adapters
  shared/                    Types and schemas shared by server and client
```

## Current Status

This is an MVP moving toward a branded Market Bubble live hub. It runs with demo messages by default and includes opt-in real ingestion for Twitch EventSub WebSocket and X Filtered Stream, plus a Kick webhook subscription helper. X broadcast chat is handled through an experimental in-app livechat browser workaround because X does not expose a documented broadcast chat API.

Twitch now uses in-app OAuth as the preferred local flow. OAuth sessions are stored in `.data/twitch-session.json`, which is ignored by git because it contains access and refresh tokens. Manual Twitch token values in `.env` are fallback/debug values.

Kick also has an in-app OAuth flow for local testing through a public tunnel or deployed URL. OAuth sessions are stored in `.data/kick-session.json`; manual `KICK_ACCESS_TOKEN` and `KICK_BROADCASTER_USER_ID` values remain as an app-token fallback.

The Source Settings page exposes local operator controls for tracked Twitch broadcasters, Kick webhook subscription attempts, and X Filtered Stream rules/restarts. Those controls change the current server process and persisted OAuth sessions; keep durable startup defaults in `.env`.

For high-volume streams, both the server and browser retain only a bounded recent message window. Configure it with `CHAT_HISTORY_LIMIT` in `.env`; the default is `500`.

Before treating a build as deploy-ready, run:

```bash
npm run verify
```
