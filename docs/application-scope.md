# Application Scope and Expectations

Last updated: 2026-06-09

## Product Goal

Create a unified live chat application that collects supported live stream chat or stream-adjacent messages from multiple platforms and presents them in one realtime interface. Each message must clearly show:

- platform of origin
- source channel or configured stream
- platform username and display name when available
- message body
- timestamp and platform-specific identity metadata when available

## MVP Scope

The MVP supports three sources:

- Twitch chat messages through EventSub `channel.chat.message`
- Kick chat messages through webhook event `chat.message.sent`
- X public posts through Filtered Stream rules

The application will provide:

- a normalized message contract shared by all adapters
- a realtime browser UI over WebSocket
- platform filters
- local/demo ingestion for development
- webhook routes for Twitch and Kick payloads
- X adapter support for Filtered Stream payload normalization
- documentation for integration assumptions and open questions

## Explicit X Expectation

X is not treated as a guaranteed livestream chat provider in the MVP. Current public X API documentation supports realtime public Posts through Filtered Stream and private XChat/DM activity events through X Activity, but does not establish a first-class public livestream chat feed equivalent to Twitch or Kick chat.

For this project, X messages mean public posts matching configured rules such as:

- a livestream hashtag
- a broadcaster mention
- posts from a specific account
- a conversation or event keyword

If X later provides a dedicated livestream chat API, the `XAdapter` should be extended or replaced while preserving the shared `ChatMessage` contract.

## Out of Scope for MVP

- scraping undocumented endpoints or bypassing platform protections
- sending messages back to platforms
- full moderation tooling
- payment, subscription, or monetization events
- historical replay beyond retained in-memory messages
- production OAuth account linking
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
- The initial implementation keeps a bounded recent message window in memory. `CHAT_HISTORY_LIMIT` defaults to 500 and applies to the server snapshot and browser-side live feed.
- Future production versions should move fan-out and buffering to Redis.
- Future production versions should persist retained history to PostgreSQL.

## Open Product Questions

- Should X be required for the first release if it only represents public posts?
- Should users configure one combined stream session or multiple named sessions?
- How long should normalized messages and raw payloads be retained?
- Should deleted/moderated messages be removed, marked, or hidden in the unified chat?
- Is this intended for a single streamer dashboard or a multi-user hosted SaaS?
