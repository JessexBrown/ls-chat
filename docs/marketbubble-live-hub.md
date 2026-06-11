# Market Bubble Live Hub Specification

Last updated: 2026-06-10

## Product Vision

Market Bubble should become the native live destination for a shared broadcast experience. The app should still ingest Twitch, Kick, and X live chats, but the public viewer experience should live on the Market Bubble site and present one combined room:

- live stream player
- switchable stream source controls for viewers who prefer Twitch, Kick, X/watch-only, or the primary Market Bubble feed
- combined chat from all connected platforms
- native Market Bubble chat
- combined viewer count
- per-source viewer breakdown on hover
- clear message labels showing platform, source broadcaster, chatter, and message

## Surfaces

### Operator Console

The existing root app remains the operator/admin console. It is used to connect OAuth accounts, manage tracked broadcasters, start or stop X livechat capture targets, monitor health, and test local messages.

### Public Live Dashboard

`/live` is the public viewer-facing dashboard. It should prioritize the stream and combined chat over settings. Viewers can watch the configured stream, read the unified chat, see total viewers, inspect viewer source breakdowns, and send messages into native Market Bubble chat.

The public stream surface supports source switching. The operator-configured primary feed is shown first, then the dashboard can expose stream/watch choices built from active tracked sources. This lets a viewer stay in the native Market Bubble chat while choosing the playback surface they prefer, such as Kick for fewer ads or Twitch for platform-specific viewing features.

Embedded platform players can still pause or interrupt playback for reasons outside the app, including platform ad behavior, browser autoplay/power policies, or the iframe provider's own session rules. The viewer surface should keep a visible player reload action and external open action so viewers can recover playback without losing the shared chat room.

`/embed` is the iframe-friendly version of the same viewer surface for dropping into an existing website. `/embed?view=chat` provides a chat-only module when the host page already owns stream playback.

The app can also run in public-only env mode with `PUBLIC_LIVE_ONLY=true`. In that deployment shape, `/live` is the only user-facing application surface, `/` redirects to `/live`, admin/OAuth/settings APIs are disabled, and sources are configured before boot through environment variables.

## Source Identity

Every chat message must preserve two identities:

- the platform of origin: Twitch, Kick, X, or Market Bubble
- the stream/source of origin: broadcaster, channel, livechat URL, filtered-stream rule, or native Market Bubble room

The UI should show source identity concisely because high-volume chat must remain dense. Hover details can expose the fuller source URL or viewer breakdown when available.

## Viewer Counts

The combined viewer count is the sum of known viewer counts from active sources.

- Twitch: retrieve from Helix Get Streams, which exposes `viewer_count`.
- Kick: retrieve from public livestream endpoints, which expose `viewer_count` for livestream records.
- Market Bubble: count active public dashboard WebSocket viewers.
- X: show the livechat source in the breakdown, but count remains unknown until a reliable X-specific viewer capture path is implemented.

Unknown sources should remain visible in the breakdown so operators and viewers understand what is connected even when a numeric count is unavailable.

## Native Chat

Market Bubble native chat is a first-party source with platform `marketbubble`. Messages submitted from `/live` are normalized into the same shared `ChatMessage` pipeline as external platforms. This keeps rendering, WebSocket fan-out, source labels, and message retention consistent.

The strategic purpose of native chat is not only message capture. It should become the shared room that Twitch, Kick, and X viewers recognize as the canonical conversation around the Market Bubble show. Production versions should move toward account-backed identity, moderation tools, badges, pinned context, and visible cross-platform source labeling so the website has social value that the individual platforms cannot provide alone.

Until account login is added, the server issues a signed guest session cookie and returns a stable guest identity to the public client. Viewers no longer choose arbitrary display names in the unauthenticated composer. The signed guest session is not full account authentication, but it gives moderation and debugging a server-controlled identifier instead of relying on editable names or client-trusted local IDs.

## Current Implementation Slice

The current implementation adds:

- shared source metadata fields on chat messages
- a `ViewerSnapshot` WebSocket envelope
- source snapshot API at `/api/sources`
- public dashboard config at `/api/public/config`
- public stream source list exposed as `streamSources`
- persisted Live Session config at `/api/live-session`
- native chat guest sessions at `/api/native-chat/session`
- native chat publishing at `/api/native-chat/messages`
- in-memory native chat rate limiting
- public dashboard route at `/live`
- iframe-friendly website embed route at `/embed`
- public-only env mode for adminless `/live` deployments
- Market Bubble platform support
- Twitch/Kick viewer-count polling foundation
- multiple simultaneous X livechat capture targets
- visual style presets, including a Market Bubble-inspired default
- public stream source switcher with compact source tabs
- stream player reload/open controls for embed recovery
- signed guest IDs for unauthenticated native chat
- compact chat rows that keep platform/source visible and move badge details into hover metadata
- admin stats dashboard with platform message share, viewer share, source breakdowns, and top chatters from retained messages
- viewer chat preferences for row density, inline labels, Twitch platform emotes, and BetterTTV emote rendering

Live Session settings are stored in `LIVE_SESSION_FILE`, defaulting to `.data/live-session.json`. Environment variables still provide first-boot defaults for dashboard title, native chat label, and stream URLs.

## Admin Stats Dashboard

The operator console should include a dedicated stats view so admins can inspect the live room without crowding the main chat. The current slice uses in-memory data that is already available to the client:

- known viewer total and unknown-count source total
- retained message count
- unique retained chatter count
- recent messages per minute
- platform-level viewer and message percentages
- source-level viewer, message, and chatter counts
- top retained chatters by message volume

This is useful for live operations, but it is not yet a durable analytics system. Production analytics should persist session events, viewer samples, native chat sends, source switching, moderation actions, and platform message counts to a database so Market Bubble can review post-show performance instead of only seeing the current retained buffer.

## Emotes and Rich Chat

Platform emotes should be supported because they make the shared chat feel alive and closer to what viewers expect from Twitch and Kick. The normalized `ChatMessage.fragments` field is the right display contract for this. The path should be:

- Twitch: map EventSub `message.fragments` emote fragments into normalized fragments with image URLs from Twitch CDN templates.
- BetterTTV: cached server-side lookup for Twitch chat that maps exact text tokens to BetterTTV global and Twitch-channel emotes using the broadcaster's numeric Twitch channel ID. The browser reads same-origin `/api/emotes/betterttv/*` endpoints so CORS/privacy tooling does not decide whether emotes work.
- Kick: inspect webhook message payloads for emote metadata and map emote tokens to stable image URLs when available.
- X: keep text-first unless the livechat capture can reliably identify emoji, stickers, or embedded media without brittle DOM assumptions.
- Market Bubble: start with Unicode emoji, then add first-party emote packs only after account identity and moderation exist.

Rendering rules should keep high-volume chat dense. Emotes should display inline at chat-line height, avoid layout jumps, lazy-load images, and fall back to text if an emote URL fails. Viewer preferences can disable all emote images or BetterTTV specifically when a viewer wants maximum density or fewer remote image requests. `BETTERTTV_CACHE_TTL_MS` controls the app-side cache window.

## Production Site Workflow

See `docs/admin-native-user-website-readiness.md` for the current role, native identity, and deployment-readiness plan.

The intended production workflow should separate public viewers from operators:

1. Operators authenticate in the admin console, connect Twitch/Kick OAuth, and configure X livechat capture targets.
2. Operators choose the active Market Bubble live session, stream sources, public dashboard title, and native chat label.
3. The Market Bubble site embeds or hosts the public `/live` experience as the viewer destination.
4. Viewers choose their preferred playback source while remaining in the shared Market Bubble chat room.
5. External platform chats flow into the shared room as labeled inputs; Market Bubble native chat becomes the canonical first-party conversation.
6. The admin console monitors source health, viewer totals, stats, and moderation.

For production, the public viewer surface should not expose integration controls, environment status, raw errors, OAuth actions, or capture tooling. Admin routes should be protected behind real authentication before deployment outside local development.

## Security and Moderation Expectations

Native chat is the highest-risk surface because it accepts public user input directly into the Market Bubble room. Before production launch, it needs:

- account-backed or signed-session identity
- durable rate limiting shared across app instances
- moderation actions for delete, timeout, ban, and message hold
- blocked terms, duplicate-message controls, and link restrictions
- audit logs for admin actions and integration changes
- careful reverse-proxy trust configuration for client IP handling
- CSP and iframe policy review for the embedded public site
- secret isolation for OAuth tokens, webhook secrets, X capture tokens, and session files

Until those exist, unauthenticated native chat should be treated as a functional prototype with basic rate limiting, not as a fully trusted production community system.

## Visual Direction

Market Bubble's public site is a dark Framer-built brand experience using high-contrast white text, near-black surfaces, DM Sans / Host Grotesk typography, and pale chartreuse as a signature accent. The app should borrow that energy without becoming a marketing page: dense chat and stream utility stay primary, while the visual system adds identity through sharper typography, dramatic dark surfaces, thin glowing borders, and style presets that can be cycled live.

## Open Questions

- Which exact stream embed should be used on Market Bubble production pages?
- Should native chat usernames be anonymous, account-backed, or OAuth-backed?
- Should public chat posting add CAPTCHA, signed viewer sessions, or stronger identity after the basic in-memory rate limit?
- Should X viewer counts be captured from the live broadcast page, the livechat page, or left unknown?
- Should the dashboard support multiple named events or one global Market Bubble live room?
- Should stream source choices be operator-curated per event, auto-derived from tracked chat sources, or both?
- Should external platform badges be configurable per viewer, moderator-only, or only visible on hover?
- Which emote providers are acceptable for production, and should admins be able to disable remote emote images?
- Which stats should be public-facing versus admin-only?
