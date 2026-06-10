# MarketBubble Live Hub Specification

Last updated: 2026-06-10

## Product Vision

MarketBubble should become the native live destination for a shared broadcast experience. The app should still ingest Twitch, Kick, and X live chats, but the public viewer experience should live on the MarketBubble site and present one combined room:

- live stream player
- combined chat from all connected platforms
- native MarketBubble chat
- combined viewer count
- per-source viewer breakdown on hover
- clear message labels showing platform, source broadcaster, chatter, and message

## Surfaces

### Operator Console

The existing root app remains the operator/admin console. It is used to connect OAuth accounts, manage tracked broadcasters, start or stop X livechat capture targets, monitor health, and test local messages.

### Public Live Dashboard

`/live` is the public viewer-facing dashboard. It should prioritize the stream and combined chat over settings. Viewers can watch the configured stream, read the unified chat, see total viewers, inspect viewer source breakdowns, and send messages into native MarketBubble chat.

## Source Identity

Every chat message must preserve two identities:

- the platform of origin: Twitch, Kick, X, or MarketBubble
- the stream/source of origin: broadcaster, channel, livechat URL, filtered-stream rule, or native MarketBubble room

The UI should show source identity concisely because high-volume chat must remain dense. Hover details can expose the fuller source URL or viewer breakdown when available.

## Viewer Counts

The combined viewer count is the sum of known viewer counts from active sources.

- Twitch: retrieve from Helix Get Streams, which exposes `viewer_count`.
- Kick: retrieve from public livestream endpoints, which expose `viewer_count` for livestream records.
- MarketBubble: count active public dashboard WebSocket viewers.
- X: show the livechat source in the breakdown, but count remains unknown until a reliable X-specific viewer capture path is implemented.

Unknown sources should remain visible in the breakdown so operators and viewers understand what is connected even when a numeric count is unavailable.

## Native Chat

MarketBubble native chat is a first-party source with platform `marketbubble`. Messages submitted from `/live` are normalized into the same shared `ChatMessage` pipeline as external platforms. This keeps rendering, WebSocket fan-out, source labels, and message retention consistent.

## Current Implementation Slice

The current implementation adds:

- shared source metadata fields on chat messages
- a `ViewerSnapshot` WebSocket envelope
- source snapshot API at `/api/sources`
- public dashboard config at `/api/public/config`
- native chat publishing at `/api/native-chat/messages`
- public dashboard route at `/live`
- MarketBubble platform support
- Twitch/Kick viewer-count polling foundation
- multiple simultaneous X livechat capture targets

## Open Questions

- Which exact stream embed should be used on MarketBubble production pages?
- Should native chat usernames be anonymous, account-backed, or OAuth-backed?
- Should public chat posting require rate limits, CAPTCHA, or signed sessions?
- Should X viewer counts be captured from the live broadcast page, the livechat page, or left unknown?
- Should the dashboard support multiple named events or one global MarketBubble live room?
