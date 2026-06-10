# Application Scope and Expectations

Last updated: 2026-06-10

## Product Goal

Create a unified live chat application that collects supported live stream chat or stream-adjacent messages from multiple platforms and presents them in one realtime interface. The product is evolving into the MarketBubble live hub described in [MarketBubble Live Hub Specification](./marketbubble-live-hub.md).

Each message must clearly show:

- platform of origin
- source channel or configured stream
- platform username and display name when available
- message body
- timestamp and platform-specific identity metadata when available

The public experience should also show a stream player, combined chat, native MarketBubble chat, combined viewer count, and hoverable source breakdowns.

## MVP Scope

The current baseline supports four sources:

- Twitch chat messages through EventSub `channel.chat.message`
- Kick chat messages through webhook event `chat.message.sent`
- X public posts through Filtered Stream rules and experimental X livechat browser capture
- MarketBubble native chat posted from the public dashboard

The application will provide:

- a normalized message contract shared by all adapters
- a realtime browser UI over WebSocket
- platform filters
- source labels and viewer source summaries
- local/demo ingestion for development
- webhook routes for Twitch and Kick payloads
- X adapter support for Filtered Stream payload normalization
- public `/live` dashboard shell
- native MarketBubble chat endpoint
- documentation for integration assumptions and open questions

## Explicit X Expectation

X is not treated as a guaranteed official livestream chat provider. Current public X API documentation supports realtime public Posts through Filtered Stream and private XChat/DM activity events through X Activity, but does not establish a first-class public livestream chat feed equivalent to Twitch or Kick chat.

For this project, X messages can mean either public posts matching configured rules or browser-captured messages from `x.com/<username>/livechat`.

- a livestream hashtag
- a broadcaster mention
- posts from a specific account
- a conversation or event keyword

If X later provides a dedicated livestream chat API, the `XAdapter` should be extended or replaced while preserving the shared `ChatMessage` contract.

## Out of Scope for MVP

- sending messages back to platforms
- full moderation tooling
- payment, subscription, or monetization events
- historical replay beyond retained in-memory messages
- multi-tenant billing or organization administration
- AI moderation or sentiment analysis

## Security Expectations

- Secrets must remain server-side.
- Twitch EventSub webhooks must validate HMAC signatures when `TWITCH_EVENTSUB_SECRET` is configured.
- Kick webhooks must validate signatures when `KICK_PUBLIC_KEY_PEM` is configured.
- Raw platform payloads may be retained for debugging, but production storage should support retention limits and redaction.
- Browser clients should only receive normalized message fields needed for display.

## Reliability Expectations

- Ingestion must deduplicate messages by platform and platform message ID.
- WebSocket clients should receive a recent snapshot on connect.
- The server should tolerate unknown fields in platform payloads.
- Platform adapters should be small, testable modules.
- Webhook endpoints should fail closed when signature verification is configured and fails.

## Performance Expectations

- The UI should remain responsive during high-volume chat bursts.
- The primary chat surface should resemble the compact live chat views streamers already know from Twitch and Kick: dense rows, inline username/message text, minimal chrome, and fast platform identification.
- Chat source labeling should remain visible in compact layouts because multiple streamers can be tracked per platform.
- The initial implementation keeps a bounded recent message window in memory. `CHAT_HISTORY_LIMIT` defaults to 500 and applies to the server snapshot and browser-side live feed.
- Future production versions should move fan-out and buffering to Redis.
- Future production versions should persist retained history to PostgreSQL.

## Open Product Questions

- Should users configure one combined stream session or multiple named sessions?
- Which stream embed should be featured on the public MarketBubble dashboard?
- Should native MarketBubble chat require login, rate limits, or moderation?
- How long should normalized messages and raw payloads be retained?
- Should deleted/moderated messages be removed, marked, or hidden in the unified chat?
- Is this intended for a single streamer dashboard or a multi-user hosted SaaS?
