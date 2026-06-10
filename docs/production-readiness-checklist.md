# Production Readiness Checklist

Last updated: 2026-06-10

## Automated Verification

Run these before every deploy:

```bash
npm test
npm run build
```

Expected result:

- all adapter, stream embed, public dashboard, X capture, and native chat tests pass
- TypeScript build succeeds
- Vite production build succeeds

## Public Stream Source Switching

1. Open the operator console at `/`.
2. In Live Session settings, set a primary stream URL such as `https://www.twitch.tv/jynxzi`.
3. Track at least one Twitch broadcaster and one Kick broadcaster that are expected to be live or chat-active.
4. Open `/live`.
5. Confirm the stream source bar appears above the player.
6. Confirm `Primary Feed` appears first.
7. Confirm tracked Twitch/Kick sources appear as additional tabs after the source refresh.
8. Click each source tab and the previous/next buttons.
9. Confirm the stream frame updates while the combined chat stays in place.
10. Click the stream reload control and confirm only the player reloads while chat remains connected.
11. If a source cannot be embedded, confirm the fallback shows an external `Open stream` link instead of a broken blank panel.

## Native Chat Functional Test

1. Open `/live` in two browser windows.
2. In window A, confirm the composer shows an assigned `Guest ******` identity and send a short MarketBubble message.
3. Confirm the message appears in window A.
4. Confirm the same message appears in window B without refreshing.
5. Confirm the message row shows platform `MB` and the configured native chat label.
6. Hover the native username and confirm a stable MarketBubble guest ID is available in the row metadata.
7. Refresh the browser and confirm the compact guest ID in the composer remains stable.
8. Call `GET /api/messages` and confirm the message is present with:

```json
{
  "platform": "marketbubble",
  "sourceKind": "chat",
  "sourceId": "marketbubble:native-live",
  "platformUserId": "marketbubble:guest_..."
}
```

9. Send more than `NATIVE_CHAT_RATE_LIMIT` messages within `NATIVE_CHAT_RATE_WINDOW_MS`.
10. Confirm the endpoint returns `429` and the UI shows the failure text.

## Mobile Layout Test

Use a 390px wide viewport:

1. Open `/live`.
2. Confirm there is no horizontal page scrolling.
3. Confirm the stream source controls wrap cleanly.
4. Confirm the chat panel remains visible beneath the stream.
5. Confirm the native chat composer keeps the assigned guest identity, message field, and send button usable.

## Admin Stats Functional Test

1. Open the operator console at `/`.
2. Click the stats dashboard button in the header.
3. Confirm Known Viewers, Retained Messages, Unique Chatters, and Messages / Min are visible.
4. Confirm Platform Breakdown shows Twitch, Kick, X, and MarketBubble rows with viewer and message percentages.
5. Confirm Source Breakdown shows active tracked sources and native MarketBubble when public viewers are connected.
6. Send or receive messages from at least two platforms and confirm the message percentages update without refreshing.
7. Return to chat and confirm the main chat remains connected and still follows new messages.

## Dev Console Check

In local development:

1. Restart the dev server after server-side changes.
2. Open `/` and `/live` in fresh tabs.
3. Confirm there are no Vite HMR websocket errors.
4. Confirm the app websocket at `/ws` remains connected and chat updates still arrive.

The app websocket must only handle `/ws` upgrades. Vite HMR and any future websocket endpoints need to be able to receive their own upgrade requests without the chat socket rejecting them.

## Production Gaps To Close

The current native chat path is functional, but not fully production-hardened.

- Replace in-memory rate limiting with Redis, database-backed, or edge rate limiting so limits work across multiple server instances.
- Add account-backed identity or signed viewer sessions before allowing high-trust badges, moderation decisions, or persistent usernames.
- Add moderation controls: delete native messages, timeout users, ban users, and hold messages for review.
- Add spam defenses: duplicate-message detection, link limits, blocked terms, and optional CAPTCHA for unauthenticated posting.
- Add durable storage for native chat history if MarketBubble wants replay, analytics, or post-show archives.
- Add structured logs and metrics for native chat send failures, rate-limit hits, WebSocket fan-out, and source switching.
- Confirm reverse proxy behavior before production. If using `x-forwarded-for`, configure Express/proxy trust deliberately so native chat rate limiting sees the correct client IP.
- Protect the operator console with authentication before exposing the app outside local development.
- Persist viewer-count samples and chat activity if MarketBubble needs durable stats, analytics, or post-show reports.
- Review content security policy, iframe policy, and allowed origins when embedding the public hub in the MarketBubble production site.
- Define an emote policy before rendering remote platform images at scale.

## Product Insight

The native chat should become the main reason viewers choose the MarketBubble page. Twitch, Kick, and X are treated as inputs and playback options; MarketBubble should be the shared room where the identity, source labels, combined viewer context, and cross-platform conversation feel richer than any one platform chat.
