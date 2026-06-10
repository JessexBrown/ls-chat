# Integration Contract

Last updated: 2026-06-09

## Unified Message Shape

All platform adapters emit a normalized `ChatMessage`:

```ts
type ChatMessage = {
  id: string;
  platform: "twitch" | "kick" | "x";
  sourceKind: "chat" | "public_post";
  platformMessageId: string;
  platformUserId: string | null;
  username: string;
  displayName: string | null;
  channelId: string | null;
  channelName: string | null;
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

### `GET /api/messages`

Returns the recent normalized message snapshot.

### `GET /api/health`

Returns process and integration status.

The response includes current integration states for Twitch EventSub WebSocket, Kick webhook subscription, and X Filtered Stream workers.

### `GET /api/integrations/kick/config`

Returns non-secret Kick runtime configuration, including webhook URL, stored OAuth session status, token source, local ingestion state, scopes, the current broadcaster ID or slug when known, and the tracked broadcaster list used to filter incoming webhook messages.

### `POST /api/integrations/kick/subscribe-chat`

Creates or refreshes a Kick `chat.message.sent` webhook subscription and adds the target broadcaster to the local tracked list. OAuth is used for app/operator authorization. When targeting a supplied broadcaster, the server resolves the broadcaster name/ID and uses an app access token with `broadcaster_user_id`.

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

### `POST /api/integrations/kick/restart`

Refreshes Kick `chat.message.sent` subscriptions for all tracked broadcasters. If no broadcasters are tracked, it falls back to the current runtime target.

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

Stops the X livechat browser capture worker.

### `POST /api/capture/x-live`

Experimental local browser-capture bridge for X live broadcast chat. This endpoint is not an X API integration. It accepts chat rows captured from an X broadcast page that the operator has open in their browser and normalizes them as X chat messages.

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
