# Development Roadmap

Last updated: 2026-06-10

## Phase 1: Runnable MVP Foundation

- Create project documentation and shared scope.
- Define `ChatMessage` schema.
- Build adapters for Twitch, Kick, and X payload normalization.
- Add WebSocket fan-out.
- Add demo/mock ingestion.
- Build unified chat UI with platform identity, filters, search, and pause/resume.

## Phase 2: Real Platform Setup

- Add Twitch OAuth setup and EventSub subscription management.
- Add Kick OAuth setup and event subscription management.
- Add X Filtered Stream rule management and stream worker.
- Store credentials securely.
- Add integration health states and reconnect telemetry.

## Phase 3: Market Bubble Live Hub

- Add Market Bubble public dashboard at `/live`.
- Add native Market Bubble chat ingestion.
- Add source metadata and combined viewer-count snapshots.
- Poll Twitch and Kick viewer counts.
- Track multiple X livechat capture targets.
- Document production stream embed expectations.

## Phase 4: Public Hub Hardening

- Add public chat rate limiting and abuse controls.
- Add account-backed native chat identity.
- Add moderation controls for native Market Bubble messages.
- Add source-level visibility controls for public dashboard sessions.
- Add reliable X viewer-count capture if technically feasible.
- Add event/session configuration for multiple named Market Bubble broadcasts.
- Expand the admin stats dashboard from retained-buffer metrics into persisted live-session analytics.

## Phase 5: Persistence and Operations

- Add PostgreSQL for streams, connected accounts, and retained chat history.
- Add Redis for buffering, dedupe, fan-out, and worker coordination.
- Add structured logs and metrics.
- Add replay of recent messages on client reconnect.
- Add deployment-ready Docker Compose.
- Persist viewer-count samples, source-switch events, native chat sends, and moderation actions for post-show reporting.

## Phase 6: Moderation and Production Features

- Normalize deletion, timeout, ban, and clear-chat events.
- Add per-platform emote parsing, image rendering, and display options for emotes and badges.
- Add role-based access if the app becomes multi-user.
- Add retention controls.
- Add audit trails for integration changes.
- Add account-backed or signed-session identity for Market Bubble native chat.

## Phase 7: Scale and Polish

- Split ingestion workers from the web app if message volume requires it.
- Add queue-based retry and dead-letter handling.
- Add dashboard-level analytics.
- Add configurable source routing for multiple livestream sessions.
