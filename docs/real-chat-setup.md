# Real Chat Setup

Last updated: 2026-06-05

This app now supports real ingestion behind the same compact chat UI. Demo messages remain enabled by default so the UI works without credentials. Once a real source is enabled, demos auto-disable unless `DEMO_CHAT_FORCE=true`.

## Credential Checklist

Copy `.env.example` to `.env`, then fill only the integrations you want to test:

```bash
cp .env.example .env
```

Never put real tokens into source control. Treat access tokens, refresh tokens, client secrets, and webhook signing keys like passwords.

## Twitch

Twitch is the best first real-chat integration for local development because EventSub supports WebSocket transport.

Required environment variables:

```bash
TWITCH_EVENTSUB_ENABLED=true
TWITCH_CLIENT_ID=your_twitch_app_client_id
TWITCH_CLIENT_SECRET=only_used_manually_by_twitch_cli
TWITCH_REDIRECT_URI=http://localhost:4200/api/auth/twitch/callback
TWITCH_OAUTH_SCOPES=user:read:chat
TWITCH_SESSION_FILE=.data/twitch-session.json
TWITCH_USER_ACCESS_TOKEN=oauth_user_access_token
TWITCH_BROADCASTER_USER_ID=channel_user_id_to_watch
TWITCH_USER_ID=authorized_bot_or_streamer_user_id
```

The token user must be the user represented by `TWITCH_USER_ID`. For chat EventSub subscriptions, Twitch requires the chat broadcaster in `broadcaster_user_id` and the authorized bot/user in `user_id`.

### What Each Twitch Value Means

`TWITCH_CLIENT_ID`

This is the public app identifier shown in the Twitch Developer Console. The server sends it in the `Client-Id` header when it creates the EventSub subscription. This is required by the app.

`TWITCH_CLIENT_SECRET`

This is the private secret generated in the Twitch Developer Console. The app uses it only during the Twitch OAuth callback code exchange. You may also use it to configure the Twitch CLI. Keep it private. Creating a new secret can invalidate an old secret.

`TWITCH_USER_ACCESS_TOKEN`

This is now a manual fallback token for debugging. The preferred path is to click OAuth in the app, let Twitch redirect back, and let the server save the returned token in `TWITCH_SESSION_FILE`. It must be a User Access Token, not an App Access Token, because this app uses Twitch EventSub WebSocket transport.

`TWITCH_USER_ID`

This is now a manual fallback value for debugging. With OAuth, the app validates the returned token and discovers this automatically.

`TWITCH_BROADCASTER_USER_ID`

This is now a manual fallback value for debugging and startup defaults. If present, it seeds the initial tracked Twitch broadcaster list. With OAuth, the app defaults the tracked list to the authenticated Twitch user's own channel, and Source Settings can add more tracked channels by login.

`TWITCH_EVENTSUB_ENABLED`

Set this to `true` only after the other Twitch values are filled. Otherwise the worker will start and report missing credentials.

`TWITCH_REDIRECT_URI`

The local OAuth callback URL. Add the exact value to the Twitch Developer Console OAuth redirect URLs:

```text
http://localhost:4200/api/auth/twitch/callback
```

`TWITCH_OAUTH_SCOPES`

Scopes requested by the in-app OAuth button. For read-only chat ingestion, use:

```text
user:read:chat
```

`TWITCH_SESSION_FILE`

Local development token storage. The file contains Twitch access and refresh tokens and must remain ignored by git.

### Twitch Credential Steps

For the first working version, using the broadcaster account as the authorized user is still the simplest path. That means `TWITCH_USER_ID` and `TWITCH_BROADCASTER_USER_ID` will usually be the same value. The app can now track more than one Twitch broadcaster after OAuth by adding channel logins in Source Settings.

1. Go to the Twitch Developer Console and create an application.
2. Set an OAuth redirect URL. For the Twitch CLI test flow, use:

```text
http://localhost:3000
```

3. Copy the app's client ID into:

```bash
TWITCH_CLIENT_ID=...
```

4. Create a client secret in the Twitch Developer Console.

You are right that this is not the same as the token the app is asking for. The secret is used by the Twitch CLI to help create the token. Put it somewhere private while configuring the CLI:

```bash
TWITCH_CLIENT_SECRET=...
```

5. Install the Twitch CLI.

Official Windows install uses Scoop:

```powershell
scoop bucket add twitch https://github.com/twitchdev/scoop-bucket.git
scoop install twitch-cli
```

If you do not use Scoop, download the Windows zip from the Twitch CLI GitHub releases page, extract it, and add the folder containing `twitch.exe` to your Windows `Path`.

Verify installation:

```powershell
twitch version
```

6. Configure the Twitch CLI with the Client ID and Client Secret from your Twitch app:

```powershell
twitch configure
```

The prompts ask for:

```text
Client ID
Client Secret
```

7. Generate a local user access token:

```bash
twitch token --user-token --scopes "user:read:chat"
```

If you later add sending chat from this app, request `user:write:chat` too.

The command opens a browser and asks the logged-in Twitch user to approve access. For the simplest first test, make sure the browser is logged in as the broadcaster account whose chat you want to read.

8. Put the returned user access token into:

```bash
TWITCH_USER_ACCESS_TOKEN=...
```

Do not put the refresh token in `.env` yet; the current app does not use it. Save it privately for later OAuth refresh work.

9. Validate the token to retrieve the authorized user's numeric Twitch user ID:

```bash
curl.exe -H "Authorization: Bearer <TWITCH_USER_ACCESS_TOKEN>" https://id.twitch.tv/oauth2/validate
```

Use the returned `user_id` for:

```bash
TWITCH_USER_ID=...
```

The validation response also shows the token's scopes. Confirm it includes:

```text
user:read:chat
```

10. If you are watching the same account's chat and want a startup default, reuse that same ID:

```bash
TWITCH_BROADCASTER_USER_ID=...
```

If you need another channel's numeric broadcaster ID for a manual startup default, call Twitch Get Users by login:

```bash
curl.exe -H "Authorization: Bearer <TWITCH_USER_ACCESS_TOKEN>" \
  -H "Client-Id: <TWITCH_CLIENT_ID>" \
  "https://api.twitch.tv/helix/users?login=channel_login_name"
```

11. Enable Twitch ingestion:

```bash
TWITCH_EVENTSUB_ENABLED=true
DEMO_CHAT_ENABLED=false
```

Startup flow:

1. The app connects to `wss://eventsub.wss.twitch.tv/ws`.
2. Twitch sends a welcome message with a WebSocket session ID.
3. The app creates one `channel.chat.message` EventSub subscription per tracked Twitch broadcaster using that session ID.
4. Incoming Twitch chat messages are normalized into the unified `ChatMessage` contract.

### In-App Twitch Controls

Open the settings button in the app header.

- Use the Twitch broadcaster field to add or refresh a tracked channel by login.
- Remove a tracked Twitch channel from the target chip list to restart the EventSub WebSocket worker without that channel.
- Use Restart to reconnect Twitch with the current runtime config.
- Use OAuth to authorize the current browser's Twitch account through the app.
- Use Disconnect to stop Twitch and remove the local OAuth session file.

The OAuth flow stores the returned access token, refresh token, and tracked broadcaster list in `TWITCH_SESSION_FILE`. On startup, the app loads that session, validates it with Twitch, refreshes it if needed, and starts the EventSub WebSocket worker.

Twitch subscriptions are tied to the current EventSub WebSocket session. When a Twitch broadcaster is removed locally, the app stops the old worker and starts a new worker with the remaining tracked broadcaster IDs, which closes the old active WebSocket subscriptions. The webhook endpoint also filters against the tracked list as a safety net for webhook-mode testing.

## Kick

Kick's official chat-message ingestion path is webhook-based. Localhost cannot receive those events directly from Kick unless it is exposed through a public HTTPS tunnel or the app is deployed.

For webhook URL and hosting choices, see `docs/kick-webhook-hosting.md`.

Required environment variables:

```bash
KICK_WEBHOOK_URL=https://your-public-domain.example/api/webhooks/kick
KICK_INGESTION_ENABLED=true
KICK_CLIENT_ID=kick_app_client_id
KICK_CLIENT_SECRET=kick_app_client_secret
KICK_REDIRECT_URI=https://your-public-domain.example/api/auth/kick/callback
KICK_OAUTH_SCOPES=events:subscribe channel:read
KICK_SESSION_FILE=.data/kick-session.json
KICK_PUBLIC_KEY_PEM=kick_public_key_pem_for_signature_verification
```

Webhook endpoint:

```text
POST /api/webhooks/kick
```

Subscription helper:

```text
POST /api/integrations/kick/subscribe-chat
```

If `KICK_AUTO_SUBSCRIBE=true`, the server refreshes subscriptions for every tracked Kick broadcaster on startup. If no targets are tracked yet, it falls back to the stored Kick OAuth session or configured app-token defaults. This env-driven path is intended for adminless/public-only boot. The Kick developer app still needs its webhook URL configured to a public HTTPS URL that routes to `/api/webhooks/kick`.

In Source Settings, the Kick section shows whether the token and signature key are present, plus the tracked broadcaster list. Use OAuth to authorize Kick through the app, Subscribe to add or refresh a target broadcaster, Restart to refresh all tracked targets, the target chip remove button to stop accepting events for that broadcaster, and Disconnect to remove the local Kick OAuth session and pause local Kick ingestion. `KICK_WEBHOOK_URL` is displayed there as a reminder of the public URL that should already be configured in Kick.

Kick webhook subscriptions live on Kick's side. Old subscriptions may continue to POST webhook events to this app, but the app now filters every Kick webhook against the tracked broadcaster list. If a broadcaster is removed from that list, the app returns `202` and ignores their events locally. If you disconnect locally, the app also returns `202` and ignores all Kick events while ingestion is paused. Set `KICK_INGESTION_ENABLED=false` if you want the app to start in that paused state.

### Kick Credential Steps

Kick requires a public HTTPS webhook URL before real chat events can reach this local app. For local testing, use a tunnel such as Cloudflare Tunnel or ngrok. For production, use your deployed HTTPS app URL.

1. Create or sign in to a Kick account.
2. Enable 2FA in Kick account settings. Kick requires 2FA to access developer tools.
3. Go to Kick Account Settings, then the Developer tab.
4. Create a Kick app. This gives you:

```bash
KICK_CLIENT_ID=...
KICK_CLIENT_SECRET=...
```

These are not currently consumed directly by this app, but you need them to create access tokens.

5. Configure the Kick app webhook URL to your public callback:

```text
https://your-public-domain.example/api/webhooks/kick
```

For a local tunnel, the callback should be the tunnel HTTPS URL plus `/api/webhooks/kick`.

6. Configure the Kick app redirect URL to your public OAuth callback:

```text
https://your-public-domain.example/api/auth/kick/callback
```

For a local tunnel, this should be the same tunnel HTTPS URL plus `/api/auth/kick/callback`.

Put the same value in `.env` for operator visibility:

```bash
KICK_WEBHOOK_URL=https://your-public-domain.example/api/webhooks/kick
KICK_REDIRECT_URI=https://your-public-domain.example/api/auth/kick/callback
```

7. Retrieve Kick's public key and paste it into `KICK_PUBLIC_KEY_PEM`:

```bash
curl https://api.kick.com/public/v1/public-key
```

Use one-line escaped-newline PEM formatting in `.env`:

```bash
KICK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

8. Use in-app OAuth.

Set:

```bash
KICK_OAUTH_SCOPES=events:subscribe channel:read
KICK_SESSION_FILE=.data/kick-session.json
```

Run the app, open Source Settings, and click OAuth in the Kick section. Kick will redirect back to `KICK_REDIRECT_URI`. The app stores the returned access and refresh tokens in `KICK_SESSION_FILE`, resolves the authenticated channel when Kick grants `channel:read`, and subscribes to `chat.message.sent`.

Kick OAuth is treated as the operator login/authorization step for the authenticated Kick account. To subscribe to a different target channel from the dashboard, first complete Kick OAuth, then type that channel into the Kick broadcaster field and click Subscribe. The server resolves the channel name with `channel:read` when available, then creates the `chat.message.sent` subscription with an app access token and `broadcaster_user_id`.

Dashboard Subscribe and Restart require a stored Kick OAuth session. `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` may still be used by the backend to mint the app access token that Kick requires for targeted webhook subscriptions, but those credentials alone no longer unlock manual dashboard subscription. Env-driven startup can still use `KICK_AUTO_SUBSCRIBE=true` when you intentionally want a no-dashboard, preconfigured `/live` deployment.

If Kick only returns `events:subscribe`, OAuth can still subscribe for the authenticated channel, but readable channel lookup is skipped. Targeting by channel name/slug requires `channel:read`; without it, use a numeric Kick broadcaster ID.

9. App-token targeting details.

When you target another broadcaster, the server needs an app access token. If `KICK_ACCESS_TOKEN` is empty, the app automatically requests one with the client credentials grant using `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET`.

Manual app access token option:

```bash
curl -X POST https://id.kick.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$KICK_CLIENT_ID" \
  -d "client_secret=$KICK_CLIENT_SECRET"
```

User access token option:

Use Kick's OAuth 2.1 Authorization Code flow with PKCE and request:

```text
events:subscribe
```

Put the resulting access token into:

```bash
KICK_ACCESS_TOKEN=...
```

10. Find the broadcaster user ID when name lookup is unavailable.

If the token is a user token for the broadcaster, call:

```bash
curl -H "Authorization: Bearer $KICK_ACCESS_TOKEN" https://api.kick.com/public/v1/users
```

If using a different token type, use Kick's channel/user APIs or the Developer dashboard to identify the numeric broadcaster user ID.

11. Put that numeric ID into:

```bash
KICK_BROADCASTER_USER_ID=...
```

12. Subscribe to the chat webhook.

Either enable auto-subscribe:

```bash
KICK_AUTO_SUBSCRIBE=true
```

or run the server and call:

```bash
curl -X POST http://localhost:4200/api/integrations/kick/subscribe-chat \
  -H "Content-Type: application/json" \
  -d "{}"
```

Or use the Subscribe button in the Kick settings drawer.

Once the subscription exists, Kick will POST `chat.message.sent` events to `/api/webhooks/kick`.

## X

X is modeled as stream-adjacent public posts, not first-class livestream chat. The app connects to the X API v2 Filtered Stream endpoint and normalizes matching posts into the chat feed.

Required environment variables:

```bash
X_STREAM_ENABLED=true
X_BEARER_TOKEN=your_x_api_bearer_token
X_FILTER_RULES="#yourStreamHashtag|stream hashtag;@yourHandle|broadcaster mention"
```

`X_FILTER_RULES` is a semicolon-separated list. Each entry is:

```text
rule value|display tag
```

If rules are provided, the app adds any missing rules before connecting. It does not delete existing X rules.

In the app settings drawer, the X section can save rules, restart the stream, or stop it for the current server process. Rule changes made there are runtime-only; copy stable rules back into `X_FILTER_RULES` when you want them to survive a restart.

### X Credential Steps

X does not provide a Twitch/Kick-style livestream chat API for this use case. The official API integration uses public Posts matching Filtered Stream rules.

For actual X broadcast chat, use the in-app livechat browser workaround in `docs/x-live-capture.md`. That path does not require X API credentials. It opens X's `https://x.com/<username>/livechat` page in a dedicated Chrome/Edge profile and captures visible chat through the local browser debugging protocol.

1. Create or sign in to an X developer account.
2. Create a Project and App in the X Developer Portal.
3. Open the App's Keys and Tokens section.
4. Copy or generate the app-only Bearer Token.
5. Put it into:

```bash
X_BEARER_TOKEN=...
```

6. Choose the public posts you want to treat as stream-adjacent chat. Examples:

```bash
X_FILTER_RULES="#MyStream|stream hashtag;@myhandle|broadcaster mention"
```

7. Enable X ingestion:

```bash
X_STREAM_ENABLED=true
```

The app adds missing rules before connecting. If the X API plan does not include Filtered Stream access, the worker will report the API error in `/api/health`.

### X Live Broadcast Chat Workaround

The preferred workaround is controlled from Source Settings:

1. Enter X usernames in `X_LIVE_CHAT_TARGETS`, or enter a username in `Target Account`.
2. Open Source Settings, switch to `X`, and click `Connect Sources`.
3. Use the source row links to open the X livechat pages in the operator's browser.
4. Leave those tabs open while the browser bridge or extension forwards visible chat.
5. Use `Start Workers` only on a dedicated capture machine where the server can launch Chrome.

Optional environment variables:

```bash
X_LIVE_CHAT_CHROME_PATH=
X_LIVE_CHAT_PROFILE_DIR=.data/x-live-chat-profile
X_LIVE_CHAT_DEBUG_PORT=9223
X_LIVE_CHAT_SCAN_MS=1200
X_LIVE_CHAT_WORKER_AUTO_START=false
X_LIVE_CHAT_TARGETS=
```

For public-facing pages without using the admin dashboard, set `X_LIVE_CHAT_TARGETS` to the desired usernames but keep `X_LIVE_CHAT_WORKER_AUTO_START=false` on the hosted/public app. Run the operator-side capture agent instead:

```bash
X_LIVE_CAPTURE_ENDPOINT=https://live.marketbubble.com/api/capture/x-live
X_LIVE_CAPTURE_TOKEN=the-same-token-configured-on-the-server
npm run capture:x
```

The capture machine must be able to launch Chrome/Edge and the capture browser profile must be signed into X. `/live` and `/embed` should only display X messages after the capture agent or browser bridge posts them to the server; ordinary visitors should never be prompted to open X.

The app also exposes the older local capture endpoint and helper script:

```text
POST /api/capture/x-live
GET /x-live-capture.js
```

Open the X broadcast page, paste the loader from `docs/x-live-capture.md` into the browser console, then click the visible chat area. The helper observes visible chat rows and forwards them to Market Bubble Live Chat as `platform: "x"` and `sourceKind: "chat"`.

## Health Check

Use this endpoint while bringing sources online:

```text
GET /api/health
```

It returns current integration status for Twitch, Kick, and X. It also reports whether `.env` loaded, whether demo mode is active, and whether required Twitch credential fields are present. It does not print token values.

## Sources

- [Twitch EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events)
- [Twitch chat EventSub setup](https://dev.twitch.tv/docs/chat/authenticating/)
- [Twitch CLI token command](https://dev.twitch.tv/docs/cli/token-command/)
- [Twitch token validation](https://dev.twitch.tv/docs/authentication/validate-tokens)
- [Twitch EventSub subscription types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- [Kick developer overview](https://help.kick.com/en/articles/8159966-kick-dev)
- [Kick app setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/getting-started/kick-apps-setup.md)
- [Kick OAuth 2.1](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/getting-started/generating-tokens-oauth2-flow.md)
- [Kick scopes](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/scopes/scopes.md)
- [Kick webhook security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md)
- [Kick webhook payloads](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/event-types.md)
- [Kick Public API Swagger](https://api.kick.com/swagger/index.html)
- [X Filtered Stream quickstart](https://docs.x.com/x-api/posts/filtered-stream/quickstart)
- [X app-only Bearer Token](https://docs.x.com/fundamentals/authentication/oauth-2-0/application-only)
- [X stream filtered posts reference](https://docs.x.com/x-api/stream/stream-filtered-posts)
