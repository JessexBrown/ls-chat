# Development Roadmap

Last updated: 2026-06-05

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

## Phase 3: Persistence and Operations

- Add PostgreSQL for streams, connected accounts, and retained chat history.
- Add Redis for buffering, dedupe, fan-out, and worker coordination.
- Add structured logs and metrics.
- Add replay of recent messages on client reconnect.
- Add deployment-ready Docker Compose.

## Phase 4: Moderation and Production Features

- Normalize deletion, timeout, ban, and clear-chat events.
- Add per-platform display options for emotes and badges.
- Add role-based access if the app becomes multi-user.
- Add retention controls.
- Add audit trails for integration changes.

## Phase 5: Scale and Polish

- Split ingestion workers from the web app if message volume requires it.
- Add queue-based retry and dead-letter handling.
- Add dashboard-level analytics.
- Add configurable source routing for multiple livestream sessions.
