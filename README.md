# LS Chat

LS Chat is a unified live chat application for aggregating stream-adjacent messages from Twitch, Kick, and X into one operator-friendly chat surface.

The first development slice is intentionally narrow:

- normalize all platform payloads into one shared `ChatMessage` contract
- receive Twitch EventSub and Kick webhook payloads
- model official X API ingestion as public posts from Filtered Stream rules, with an experimental in-app livechat browser workaround for X broadcast chat
- broadcast normalized messages to the browser over WebSocket
- provide a polished realtime chat UI with platform filters and development mock ingestion

## Quick Start

```bash
npm install
npm run dev
```

Then open `http://localhost:4200`.

`npm run dev` starts one stable server process. The React frontend still hot reloads through Vite middleware. Use `npm run dev:watch` only when actively changing server code and wanting automatic server restarts.

## Project Shape

```text
docs/
  application-scope.md       Product scope, expectations, and constraints
  development-roadmap.md     Phased implementation plan
  integration-contract.md    Shared message contract and ingress endpoints
  kick-webhook-hosting.md    Public webhook URL and hosting options for Kick
  real-chat-setup.md         Real Twitch, Kick, and X ingestion setup
  x-live-capture.md          Browser-assisted X broadcast chat workaround
src/
  client/                    React realtime chat UI
  server/                    Express/WebSocket server and platform adapters
  shared/                    Types and schemas shared by server and client
```

## Current Status

This is an MVP scaffold. It runs with demo messages by default and includes opt-in real ingestion for Twitch EventSub WebSocket and X Filtered Stream, plus a Kick webhook subscription helper. X broadcast chat is handled through an experimental in-app livechat browser workaround because X does not expose a documented broadcast chat API.

Twitch now uses in-app OAuth as the preferred local flow. OAuth sessions are stored in `.data/twitch-session.json`, which is ignored by git because it contains access and refresh tokens. Manual Twitch token values in `.env` are fallback/debug values.

Kick also has an in-app OAuth flow for local testing through a public tunnel or deployed URL. OAuth sessions are stored in `.data/kick-session.json`; manual `KICK_ACCESS_TOKEN` and `KICK_BROADCASTER_USER_ID` values remain as an app-token fallback.

The Source Settings page exposes local operator controls for tracked Twitch broadcasters, Kick webhook subscription attempts, and X Filtered Stream rules/restarts. Those controls change the current server process and persisted OAuth sessions; keep durable startup defaults in `.env`.

For high-volume streams, both the server and browser retain only a bounded recent message window. Configure it with `CHAT_HISTORY_LIMIT` in `.env`; the default is `500`.
