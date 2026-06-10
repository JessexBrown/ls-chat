# MarketBubble Live Hub Specification

Last updated: 2026-06-10

## Product Vision

MarketBubble should become the native live destination for a shared broadcast experience. The app should still ingest Twitch, Kick, and X live chats, but the public viewer experience should live on the MarketBubble site and present one combined room:

- live stream player
- switchable stream source controls for viewers who prefer Twitch, Kick, X/watch-only, or the primary MarketBubble feed
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

The public stream surface supports source switching. The operator-configured primary feed is shown first, then the dashboard can expose stream/watch choices built from active tracked sources. This lets a viewer stay in the native MarketBubble chat while choosing the playback surface they prefer, such as Kick for fewer ads or Twitch for platform-specific viewing features.

Embedded platform players can still pause or interrupt playback for reasons outside the app, including platform ad behavior, browser autoplay/power policies, or the iframe provider's own session rules. The viewer surface should keep a visible player reload action and external open action so viewers can recover playback without losing the shared chat room.

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

The strategic purpose of native chat is not only message capture. It should become the shared room that Twitch, Kick, and X viewers recognize as the canonical conversation around the MarketBubble show. Production versions should move toward account-backed identity, moderation tools, badges, pinned context, and visible cross-platform source labeling so the website has social value that the individual platforms cannot provide alone.

Until account login is added, the public client creates a stable local guest ID and sends it with native chat messages. That ID is not strong authentication, but it gives moderation and debugging a consistent browser-level identifier instead of relying only on editable display names.

## Current Implementation Slice

The current implementation adds:

- shared source metadata fields on chat messages
- a `ViewerSnapshot` WebSocket envelope
- source snapshot API at `/api/sources`
- public dashboard config at `/api/public/config`
- public stream source list exposed as `streamSources`
- persisted Live Session config at `/api/live-session`
- native chat publishing at `/api/native-chat/messages`
- in-memory native chat rate limiting
- public dashboard route at `/live`
- MarketBubble platform support
- Twitch/Kick viewer-count polling foundation
- multiple simultaneous X livechat capture targets
- visual style presets, including a MarketBubble-inspired default
- public stream source switcher with compact source tabs
- stream player reload/open controls for embed recovery
- stable local guest IDs for unauthenticated native chat
- compact chat rows that keep platform/source visible and move badge details into hover metadata

Live Session settings are stored in `LIVE_SESSION_FILE`, defaulting to `.data/live-session.json`. Environment variables still provide first-boot defaults for dashboard title, native chat label, and stream URLs.

## Visual Direction

MarketBubble's public site is a dark Framer-built brand experience using high-contrast white text, near-black surfaces, DM Sans / Host Grotesk typography, and pale chartreuse as a signature accent. The app should borrow that energy without becoming a marketing page: dense chat and stream utility stay primary, while the visual system adds identity through sharper typography, dramatic dark surfaces, thin glowing borders, and style presets that can be cycled live.

## Open Questions

- Which exact stream embed should be used on MarketBubble production pages?
- Should native chat usernames be anonymous, account-backed, or OAuth-backed?
- Should public chat posting add CAPTCHA, signed viewer sessions, or stronger identity after the basic in-memory rate limit?
- Should X viewer counts be captured from the live broadcast page, the livechat page, or left unknown?
- Should the dashboard support multiple named events or one global MarketBubble live room?
- Should stream source choices be operator-curated per event, auto-derived from tracked chat sources, or both?
- Should external platform badges be configurable per viewer, moderator-only, or only visible on hover?
