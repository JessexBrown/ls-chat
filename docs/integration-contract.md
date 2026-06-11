# Integration Contract

Last updated: 2026-06-10

## Unified Message Shape

All platform adapters emit a normalized `ChatMessage`:

```ts
type ChatMessage = {
  id: string;
  platform: "twitch" | "kick" | "x" | "marketbubble";
  sourceKind: "chat" | "public_post";
  platformMessageId: string;
  platformUserId: string | null;
  username: string;
  displayName: string | null;
  channelId: string | null;
  channelName: string | null;
  sourceId: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  message: string;
  fragments: MessageFragment[];
  badges: MessageBadge[];
  avatarUrl: string | null;
  color: string | null;
  sentAt: string | null;
  receivedAt: string;
  raw?: unknown;
};
```

The source fields identify the stream or broadcaster origin independently of the chatter identity. They are used by compact chat labels and the combined viewer-count breakdown.

`fragments` are the rich rendering contract for chat text. Plain messages can provide one `text` fragment. Platform emotes should use `type: "emote"` with a safe image `url` when the adapter can derive one. The client renders emote image fragments inline and falls back to fragment text for non-image fragments.

## Viewer Source Shape

The server also publishes source snapshots:

```ts
type ViewerSource = {
  id: string;
  platform: "twitch" | "kick" | "x" | "marketbubble";
  label: string;
  channelId: string | null;
  channelName: string | null;
  sourceUrl: string | null;
  viewerCount: number | null;
  chattersCount: number | null;
  status: "unknown" | "offline" | "live" | "connected" | "error";
  detail: string | null;
  updatedAt: string;
};
```

`viewerCount: null` means the source is connected but does not have a reliable numeric count yet.

## Ingress Endpoints

### `POST /api/webhooks/twitch/eventsub`

Accepts Twitch EventSub webhook payloads. The server handles callback verification challenges and normalizes `channel.chat.message` notifications.

When `TWITCH_EVENTSUB_SECRET` is configured, requests must pass Twitch EventSub HMAC validation.

### `POST /api/webhooks/kick`

Accepts Kick webhook payloads and normalizes `chat.message.sent`.

When `KICK_PUBLIC_KEY_PEM` is configured, requests must pass Kick signature validation.

If local Kick ingestion is paused, the endpoint returns `202 accepted` with `ignored: true` so Kick does not see webhook failures, but the message is not published to the unified chat.

### `POST /api/mock/messages`

Development-only normalized mock ingestion.

```json
{
  "platform": "twitch",
  "username": "viewer_name",
  "message": "hello from the test harness"
}
```

### `GET /api/native-chat/session`

Issues or refreshes a signed native Market Bubble guest session. The response contains the viewer identity that `/live` should display in the native chat composer. The session is also stored in an HttpOnly cookie named `mb_native_guest` by default.

```json
{
  "identity": {
    "kind": "guest",
    "clientId": "guest_abc123",
    "displayName": "Guest ABC123",
    "issuedAt": "2026-06-10T16:00:00.000Z",
    "lastSeenAt": "2026-06-10T16:00:00.000Z"
  },
  "nativeChatLabel": "Market Bubble",
  "maxMessageLength": 500
}
```

### `POST /api/native-chat/messages`

Publishes a first-party Market Bubble native chat message into the same normalized chat stream.

```json
{
  "message": "hello from Market Bubble"
}
```

The endpoint trims messages, caps messages at 500 characters, refreshes or creates the signed guest session cookie, and applies a small in-memory rate limit keyed to the signed guest identity plus network address. Client-supplied `clientId` and `username` are accepted only as a backward-compatible fallback; when a signed guest session exists, native messages use `platformUserId: "marketbubble:<signedGuestId>"` and the server-issued display name.

```text
NATIVE_CHAT_RATE_LIMIT=8
NATIVE_CHAT_RATE_WINDOW_MS=10000
NATIVE_CHAT_SESSION_SECRET=long-random-secret
NATIVE_CHAT_SESSION_COOKIE=mb_native_guest
```

When the rate limit is exceeded, the endpoint returns `429`. When an operator has muted the signed native guest session for the current server run, the endpoint returns `403`.

### `DELETE /api/native-chat/messages/:messageId`

Operator-only endpoint for hiding one retained Market Bubble native chat message. Requires the signed operator session and `X-MB-CSRF`.

The endpoint only accepts true native Market Bubble message IDs such as `marketbubble:native-...`. Twitch, Kick, X, and local mock messages are not moderated through this route.

### `POST /api/native-chat/users/:userId/mute`

Operator-only endpoint for current-session native guest moderation. Requires the signed operator session and `X-MB-CSRF`.

The `userId` must be the normalized native user id from a Market Bubble message, for example `marketbubble:guest_abc123`. The endpoint:

- records an in-memory mute for the current server session
- hides retained native messages from that guest
- blocks future `/api/native-chat/messages` sends from that signed guest session
- also blocks new guest sessions from the same server-side hashed browser/network key when the key is known from retained messages

This survives ordinary cookie clearing on the same browser/network, but it is intentionally not a durable ban yet. A user can still bypass it by changing browser, network, VPN, or device. Persistent timeouts, bans, audit logs, and appeal/moderation history should move into account-backed and database-backed moderation storage.

### `DELETE /api/native-chat/users/:userId/mute`

Operator-only endpoint that removes a current-session native guest mute. This is primarily a support/admin recovery action until a full moderation management UI exists.

### `GET /api/messages`

Returns the recent normalized message snapshot.

### `GET /api/sources`

Returns the current viewer/source snapshot, including combined known viewer count.

### `GET /api/public/config`

Returns public dashboard configuration for `/live` and `/embed`, including the configured stream embed URL, switchable stream sources, drop-in URLs, and current source snapshot.

`streamEmbedUrl` remains available for older clients. New viewer surfaces should prefer `streamSources`.

For website installs, use `fullEmbedUrl` for the full stream-plus-chat product and `chatEmbedUrl` when the host page already has its own video player. `publicConfigUrl` is safe to call from a public website because it does not expose platform secrets or operator controls.

```json
{
  "dashboard": {
    "title": "Market Bubble Live",
    "nativeChatLabel": "Market Bubble",
    "streamEmbedUrl": "https://player.twitch.tv/?channel=jynxzi&parent=marketbubble.com&autoplay=false",
    "streamWatchUrl": "https://www.twitch.tv/jynxzi",
    "streamSources": [
      {
        "id": "session:primary",
        "platform": null,
        "label": "Primary Feed",
        "embedUrl": "https://player.twitch.tv/?channel=jynxzi&parent=marketbubble.com&autoplay=false",
        "watchUrl": "https://www.twitch.tv/jynxzi",
        "viewerCount": null,
        "status": "connected",
        "detail": "Shared live show",
        "isPrimary": true
      },
      {
        "id": "source:kick:123",
        "platform": "kick",
        "label": "jynxzi",
        "embedUrl": "https://player.kick.com/jynxzi",
        "watchUrl": "https://kick.com/jynxzi",
        "viewerCount": 1200,
        "status": "live",
        "detail": "Kick stream title",
        "isPrimary": false
      }
    ],
    "publicUrl": "https://marketbubble.com/live",
    "embedUrl": "https://marketbubble.com/embed",
    "fullEmbedUrl": "https://marketbubble.com/embed",
    "chatEmbedUrl": "https://marketbubble.com/embed?view=chat",
    "mockPageUrl": "https://marketbubble.com/mock-marketbubble",
    "publicConfigUrl": "https://marketbubble.com/api/public/config"
  }
}
```

The server builds `streamSources` from the configured primary feed plus tracked external chat/viewer sources. Twitch and Kick watch URLs are normalized into embeddable player URLs when possible. Watch-only sources remain available as external links when embedding is not reliable.

### `GET /api/live-session`

Returns the operator-editable Live Session configuration plus the current source snapshot.

### `PUT /api/live-session`

Updates the saved Live Session configuration. Values are stored in `LIVE_SESSION_FILE`, defaulting to `.data/live-session.json`.

Supported stream URLs are normalized before being served to `/live`. For example, `https://www.twitch.tv/jynxzi` becomes a Twitch player URL with the required `parent` parameter for the current host. Twitch requires embedded player URLs to include the embedding domain as `parent`.

```json
{
  "title": "Market Bubble Live",
  "nativeChatLabel": "Market Bubble",
  "streamEmbedUrl": "https://player.example/embed",
  "streamWatchUrl": "https://marketbubble.com/live",
  "description": "Shared live chat and stream"
}
```

### `GET /api/health`

Returns process and integration status.

The response includes current integration states for Twitch EventSub WebSocket, Kick webhook subscription, and X Filtered Stream workers.

### `GET /api/integrations/kick/config`

Returns non-secret Kick runtime configuration, including webhook URL, stored OAuth session status, authorization mode, local ingestion state, scopes, the current broadcaster ID or slug when known, and the tracked broadcaster list used to filter incoming webhook messages.

### `POST /api/integrations/kick/subscribe-chat`

Creates or refreshes a Kick `chat.message.sent` webhook subscription and adds the target broadcaster to the local tracked list. Dashboard subscription requires a stored Kick OAuth session. When targeting a supplied broadcaster, the server resolves the broadcaster name/ID and may use app authorization with `broadcaster_user_id` for the Kick webhook call, but app credentials alone do not unlock this manual endpoint.

The request may specify either a readable channel name/slug or numeric broadcaster ID:

```json
{
  "broadcaster": "channel_name"
}
```

```json
{
  "broadcasterUserId": "123456789"
}
```

This does not configure the public webhook URL inside the Kick developer app. The Kick app must already point to a public HTTPS URL that routes to:

```text
/api/webhooks/kick
```

`KICK_WEBHOOK_URL` is exposed in health/config responses for operator visibility only. It documents the public URL configured in Kick, but the current Kick subscription API does not accept a per-request callback URL.

### `PUT /api/runtime-config`

Updates safe process-local runtime settings from the admin Advanced Settings panel. These values do not rewrite `.env`; restart defaults still come from environment variables.

```json
{
  "messageHistoryLimit": 500,
  "viewerPollMs": 30000,
  "nativeChatRateLimit": 8,
  "nativeChatRateWindowMs": 10000
}
```

`messageHistoryLimit` trims the retained chat buffer immediately and sends connected clients a fresh snapshot.

### `POST /api/integrations/kick/restart`

Refreshes Kick `chat.message.sent` subscriptions for all tracked broadcasters. If no broadcasters are tracked, it falls back to the current runtime target. Dashboard restart requires a stored Kick OAuth session.

### `DELETE /api/integrations/kick/targets/:target`

Removes a broadcaster from the local tracked list. Remote Kick webhook subscriptions may still POST events, but the app ignores webhook messages whose broadcaster is no longer tracked.

### `POST /api/integrations/kick/disconnect`

Deletes the local Kick OAuth session file, falls back to any manual `KICK_ACCESS_TOKEN` configured in `.env`, and pauses local Kick ingestion. This does not delete remote Kick event subscriptions; existing subscriptions may still POST to `/api/webhooks/kick`, but the app will ignore them until Subscribe, Restart, OAuth, or startup config enables ingestion again.

### `GET /api/auth/kick/start`

Starts the Kick OAuth 2.1 Authorization Code with PKCE flow. Requires `KICK_CLIENT_ID`; callback completion requires `KICK_CLIENT_SECRET`.

### `GET /api/auth/kick/callback`

OAuth callback endpoint. Exchanges the authorization code for Kick access and refresh tokens, stores the local session in `KICK_SESSION_FILE`, resolves the authenticated channel when `channel:read` is granted, and subscribes to `chat.message.sent` webhooks.

### `GET /api/integrations/x/config`

Returns non-secret X runtime configuration, including whether the worker is currently running, whether `X_STREAM_ENABLED` is set for auto-start, and the parsed Filtered Stream rules.

### `POST /api/integrations/x/rules`

Updates X Filtered Stream rules for the current server process. If the X worker is running, it restarts with the updated rules. These runtime changes do not rewrite `.env`.

```json
{
  "rules": "#myStream|stream hashtag;@myhandle|broadcaster mention"
}
```

### `POST /api/integrations/x/restart`

Starts or restarts the X Filtered Stream worker using `X_BEARER_TOKEN` and the current runtime rules.

### `POST /api/integrations/x/stop`

Stops the X Filtered Stream worker for the current server process.

### `POST /api/integrations/x/livechat/start`

Starts the experimental in-app X livechat browser capture worker. This is not an X API integration. The server opens a visible Chrome/Edge window to `https://x.com/<username>/livechat` or to a supplied X livechat/broadcast URL, then captures visible chat rows through Chrome's local debugging protocol.

```json
{
  "username": "streamer_handle"
}
```

Alternative URL form:

```json
{
  "url": "https://x.com/streamer_handle/livechat"
}
```

Requires Chrome or Edge to be installed, or `X_LIVE_CHAT_CHROME_PATH` to point to the browser executable. The browser profile is stored in `X_LIVE_CHAT_PROFILE_DIR`, defaulting to `.data/x-live-chat-profile`.

### `POST /api/integrations/x/livechat/stop`

Stops all active X livechat browser capture workers.

### `DELETE /api/integrations/x/livechat/targets/:targetId`

Stops one active X livechat browser capture worker. Target IDs are returned in `liveChatCapture.activeTargets` from health/config responses.

### `POST /api/capture/x-live`

Experimental local browser-capture bridge for X live broadcast chat. This endpoint is not an X API integration. It accepts chat rows captured from an X broadcast page that the operator has open in their browser and normalizes them as X chat messages.

In production, feed this endpoint from a trusted operator-side capture agent rather than ordinary website visitors. Set `X_LIVE_CAPTURE_TOKEN` on both the public server and the capture machine so random clients cannot inject fake X messages.

The endpoint is CORS-limited by `X_LIVE_CAPTURE_ALLOWED_ORIGINS`, defaulting to `https://x.com`, `https://twitter.com`, `https://mobile.x.com`, `http://localhost:<PORT>`, and `http://127.0.0.1:<PORT>`. Browser extension origins are also allowed unless `X_LIVE_CAPTURE_ALLOW_EXTENSION_ORIGINS=false`. If `X_LIVE_CAPTURE_TOKEN` is configured, requests must include the token in `X-LS-Chat-Capture-Token` or in the JSON body as `token`.

```json
{
  "sourceUrl": "https://x.com/i/broadcasts/example",
  "channelName": "X Live Broadcast",
  "messages": [
    {
      "platformMessageId": "browser:abc123",
      "username": "viewer",
      "message": "hello from the X broadcast chat",
      "capturedAt": "2026-06-09T16:08:06.000Z"
    }
  ]
}
```

### `GET /x-live-capture.js`

Browser helper script for the X live capture workaround. Run it from an open X broadcast page, then click the visible chat area to start observing rendered chat rows.

### `GET /x-live-capture-test.html`

Local fixture page for testing the X live capture flow without a real X broadcast. It renders a mock broadcast/chat panel and uses the same browser capture script and server endpoint.

### `GET /api/integrations/twitch/config`

Returns non-secret Twitch runtime configuration, including the current authorized user, current broadcaster, and tracked broadcaster list.

### `GET /api/integrations/twitch/users?login=<login>`

Looks up a Twitch user by login through the Helix Get Users API. Requires `TWITCH_CLIENT_ID` and a valid user access token.

### `POST /api/integrations/twitch/broadcaster`

Adds or refreshes a Twitch broadcaster in the tracked list and restarts the EventSub WebSocket worker. The worker creates one `channel.chat.message` subscription per tracked broadcaster.

```json
{
  "login": "channel_login"
}
```

### `POST /api/integrations/twitch/restart`

Restarts the Twitch EventSub WebSocket worker using the current tracked broadcaster list.

### `DELETE /api/integrations/twitch/targets/:target`

Removes a Twitch broadcaster from the tracked list and restarts the EventSub WebSocket worker. Messages from untracked Twitch broadcasters are ignored by local webhook filtering as a safety net.

### `GET /api/auth/twitch/start`

Starts the Twitch OAuth Authorization Code flow. Requires `TWITCH_CLIENT_ID`; callback completion requires `TWITCH_CLIENT_SECRET`.

### `GET /api/auth/twitch/callback`

OAuth callback endpoint. Exchanges the authorization code for a user access token, validates the token, stores it in memory, adds the authenticated user's own channel to the tracked list, and starts the Twitch worker.

The local development implementation also writes the OAuth session to `TWITCH_SESSION_FILE` so the app can restore and refresh it after restart.

### `POST /api/integrations/twitch/disconnect`

Stops the Twitch worker and deletes the local OAuth session file.

## Browser Realtime Protocol

The browser connects to `/ws`.

Initial connection receives:

```json
{
  "type": "snapshot",
  "messages": [],
  "maxMessages": 500
}
```

`maxMessages` tells the browser how many recent messages to retain locally. It is controlled by `CHAT_HISTORY_LIMIT` and defaults to 500.

New messages receive:

```json
{
  "type": "message",
  "message": {}
}
```

Operational state receives:

```json
{
  "type": "status",
  "status": "connected"
}
```
