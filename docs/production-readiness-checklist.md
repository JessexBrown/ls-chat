# Production Readiness Checklist

Last updated: 2026-06-11

## Automated Verification

Run these before every deploy:

```bash
npm run verify
```

Expected result:

- all adapter, stream embed, public dashboard, X capture, and native chat tests pass
- Vitest refuses empty test suites
- TypeScript strict build succeeds
- Vite production build succeeds

## Public Stream Source Switching

1. Open the operator console at `/`.
2. In Live Session settings, set a primary stream URL such as `https://www.twitch.tv/jynxzi`.
3. Track at least one Twitch broadcaster and one Kick broadcaster that are expected to be live or chat-active.
4. Open `/live`.
5. Confirm the stream source dropdown appears above the player.
6. Confirm `Primary Feed` appears first.
7. Confirm tracked Twitch/Kick sources appear as dropdown options after the source refresh.
8. Select each source and use the previous/next buttons on wider screens.
9. Confirm the stream frame updates while the combined chat stays in place.
10. Click the stream reload control and confirm only the player reloads while chat remains connected.
11. If a source cannot be embedded, confirm the fallback shows an external `Open stream` link instead of a broken blank panel.

## Viewer Preferences Functional Test

1. Open `/live`.
2. Click the preferences button in the header.
3. Change the visual theme and confirm the page updates without disconnecting chat.
4. Switch between Classic, Compact, and Minimal chat row styles.
5. Toggle Platform, Time, Source, Emotes, and BetterTTV and confirm the preview updates immediately.
6. Call `GET /api/emotes/betterttv/global` and confirm it returns JSON with an `emotes` object, not the React HTML shell.
7. Send or receive a Twitch message containing `monkaS` and confirm it renders inline when BetterTTV is enabled. Channel-specific emotes only render when BetterTTV returns emotes for that numeric Twitch broadcaster ID.
8. Refresh the page and confirm the preference choices persist for the browser.

## Native Chat Functional Test

1. Open `/live` in two browser windows.
2. In window A, confirm the composer shows an assigned `Guest ******` identity and send a short Market Bubble message.
3. Confirm the message appears in window A.
4. Confirm the same message appears in window B without refreshing.
5. Confirm the message row shows the Market Bubble platform logo and the configured native chat label.
6. Hover the native username and confirm a stable Market Bubble guest ID is available in the row metadata.
7. Call `GET /api/native-chat/session` and confirm the response includes `identity.kind: "guest"` and sets the HttpOnly native guest cookie.
8. Refresh the browser and confirm the compact guest ID in the composer remains stable.
9. Call `GET /api/messages` and confirm the message is present with:

```json
{
  "platform": "marketbubble",
  "sourceKind": "chat",
  "sourceId": "marketbubble:native-live",
  "platformUserId": "marketbubble:guest_..."
}
```

10. Send more than `NATIVE_CHAT_RATE_LIMIT` messages within `NATIVE_CHAT_RATE_WINDOW_MS`.
11. Confirm the endpoint returns `429` and the UI shows the failure text.

## Native Chat Moderation Test

1. Open `/live` and send a Market Bubble native chat message.
2. Open the protected operator console at `/`.
3. Hover the Market Bubble native message row in the admin chat feed.
4. Click the hide native message control.
5. Confirm the message disappears from the admin feed and from the `/live` viewer feed without refreshing.
6. Send two more messages from the same `/live` guest session.
7. In the operator console, click the mute native guest control on one of those messages.
8. Confirm all retained messages from that native guest disappear from the admin feed and `/live` viewer feed.
9. Clear the `/live` tab's site data or open a fresh browser context from the same browser/network and try to send another native message.
10. Confirm the new guest session is still rejected as muted when the server has a browser/network key for the original retained message.
11. Confirm Twitch, Kick, X, and local mock messages do not show native moderation controls.
12. Confirm direct moderation requests without operator auth and CSRF are rejected.

This is still a current-session moderation control, not a full account ban. A determined user can bypass it by changing browser, network, VPN, or device until Market Bubble adds account-backed identity and durable moderation storage.

## Mobile Layout Test

Use a 390px wide viewport:

1. Open `/live`.
2. Confirm there is no horizontal page scrolling.
3. Open the stream source dropdown and confirm the option panel stays inside the viewport.
4. Open the viewer count dropdown and confirm the source rows stay inside the viewport.
5. Confirm the chat panel remains visible beneath the stream.
6. Confirm the public header keeps preferences, viewer count, and connection status visible without clipping.
7. Confirm the native chat composer keeps the assigned guest identity, message field, and send button usable.

## Website Embed Test

1. Open `/mock-marketbubble` and confirm the proof page resembles the current Market Bubble visual direction while embedding the product cleanly.
2. Open the operator console at `/`, choose Website Install, and confirm the URLs, demo runbook, iframe snippets, and readiness rows are visible.
3. Open `/embed` and confirm it renders the full stream-plus-chat viewer surface without outer page padding.
4. Open `/embed?view=chat` and confirm the shared chat fills the available frame with no empty stream row.
5. Confirm the Demo Runbook card shows the expected ready/check states and each linked route opens in a new tab.
6. Confirm `GET /api/public/config` includes `fullEmbedUrl`, `chatEmbedUrl`, `publicConfigUrl`, and `streamSources`.
7. Confirm `GET /api/health` shows `configuration.securityHeaders.frameAncestors` with Market Bubble origins.
8. Place the iframe snippets from the Website Install panel or `docs/website-embed-install.md` into a local HTML test page and confirm the iframe can connect to WebSocket chat.
9. Send a native chat message from the iframe and confirm the signed guest identity remains stable after iframe refresh.

## Public-Only Env Mode Test

1. Set `PUBLIC_LIVE_ONLY=true` and configure the stream/chat source env vars needed for the event.
2. Restart the server.
3. Open `/` and confirm it redirects to `/live`.
4. Open `/mock-marketbubble`, `/embed`, and `/embed?view=chat` and confirm all are allowed.
5. Confirm `/api/public/config`, `/api/messages`, `/api/sources`, `/api/native-chat/session`, `/api/native-chat/messages`, `/api/emotes/betterttv/global`, platform webhooks, and `/ws` still work.
6. Confirm `/api/health`, `/api/live-session`, `/api/runtime-config`, `/api/integrations/*`, `/api/auth/*`, and `/api/mock/*` return an admin-disabled error.
7. If using X livechat capture without the admin dashboard, keep `X_LIVE_CHAT_WORKER_AUTO_START=false` on the public app and run `npm run capture:x` from a trusted capture machine with `X_LIVE_CAPTURE_ENDPOINT`, `X_LIVE_CAPTURE_TOKEN`, and `X_LIVE_CHAT_TARGETS` set. Confirm X sources appear on `/live` as configured/pending before capture and that messages arrive after the capture profile is signed into X.

## Admin Settings Functional Test

1. Open the operator console at `/`.
2. Open Source Settings.
3. In a 390px viewport, confirm Platform Connections uses a platform dropdown instead of a clipped horizontal tab rail.
4. Confirm the admin header keeps search readable and moves secondary controls into the overflow menu.
5. Open Advanced Settings and adjust Message Limit to a safe test value, such as `300`.
6. Save and confirm the retained message count and Health response reflect the new runtime config.
7. Refresh the page and confirm the controls still show the server-accepted runtime values.

## Operator Auth Functional Test

1. Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`, then restart the server.
2. Open `/` and confirm the Market Bubble Live Desk login screen appears.
3. Enter the wrong password and confirm the app stays on the login screen.
4. Enter the correct password and confirm the operator dashboard loads.
5. Open `/live`, `/embed`, and `/embed?view=chat` in fresh tabs and confirm public viewer pages do not require operator login.
6. Open `/api/health` in a private browser before login and confirm it returns `401`.
7. After login, confirm admin mutation requests include the `X-MB-CSRF` request header in DevTools.
8. In the operator dashboard overflow menu, click Sign Out and confirm the login screen returns.
9. Open Website Install and confirm the Operator Auth readiness row is green.

## Admin Stats Functional Test

1. Open the operator console at `/`.
2. Click the stats dashboard button in the header.
3. Confirm Known Viewers, Retained Messages, Unique Chatters, and Messages / Min are visible.
4. Confirm Platform Breakdown shows Twitch, Kick, X, and Market Bubble rows with viewer and message percentages.
5. Confirm Source Breakdown shows active tracked sources and native Market Bubble when public viewers are connected.
6. Send or receive messages from at least two platforms and confirm the message percentages update without refreshing.
7. In a 390px viewport, confirm KPI cards, platform rows, source rows, and top chatter rows fit without horizontal scrolling.
8. Return to chat and confirm the main chat remains connected and still follows new messages.

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
- Add durable storage for native chat history if Market Bubble wants replay, analytics, or post-show archives.
- Add structured logs and metrics for native chat send failures, rate-limit hits, WebSocket fan-out, and source switching.
- Confirm reverse proxy behavior before production. If using `x-forwarded-for`, configure Express/proxy trust deliberately so native chat rate limiting sees the correct client IP.
- Protect the operator console with authentication before exposing the app outside local development.
- Persist viewer-count samples and chat activity if Market Bubble needs durable stats, analytics, or post-show reports.
- Review content security policy, iframe policy, and allowed origins when embedding the public hub in the Market Bubble production site.
- Keep `EMBED_ALLOWED_ORIGINS` limited to Market Bubble and intentional partner domains.
- Define an emote policy before rendering remote platform images at scale.

## Product Insight

The native chat should become the main reason viewers choose the Market Bubble page. Twitch, Kick, and X are treated as inputs and playback options; Market Bubble should be the shared room where the identity, source labels, combined viewer context, and cross-platform conversation feel richer than any one platform chat.
