# X Live Capture Workaround

X does not currently expose a documented public API for livestream broadcast chat. This workaround captures visible chat rows from an X broadcast page that you have open in your browser and forwards them to Market Bubble Live Chat.

This is intentionally less clean than Twitch/Kick:

- it depends on X page markup
- it only sees chat that is rendered in your browser
- it requires the local Market Bubble Live Chat server to be running
- it may need selector tweaks if X changes the broadcast UI

Important: opening `/live`, `/embed`, or `/mock-marketbubble` does not capture X chat by itself. Those pages display messages after the server receives them. Public viewers should never be asked to open X tabs, install extensions, or approve popups. For production, run X capture from a trusted operator/capture machine and forward messages to the hosted app.

## Server Setup

No X API credentials are required for browser capture.

Optional environment variables:

```bash
X_LIVE_CAPTURE_ALLOWED_ORIGINS=https://x.com,https://twitter.com,https://mobile.x.com,http://localhost:4200,http://127.0.0.1:4200
X_LIVE_CAPTURE_ALLOW_EXTENSION_ORIGINS=true
X_LIVE_CAPTURE_TOKEN=optional_shared_local_token
```

If `X_LIVE_CAPTURE_TOKEN` is set, the browser helper must be given the same token before it starts:

```js
window.LS_CHAT_CAPTURE_TOKEN = "optional_shared_local_token";
```

## Preferred Operator Workflow: Connect X Sources

Use the admin dashboard when possible:

1. Open `/`.
2. Go to **Source Settings**.
3. Switch to `X`.
4. Click **Connect Sources**.
5. Use **Open First X Tab** or each source row's **Open** link to open configured `X_LIVE_CHAT_TARGETS` / X rules targets in the current browser.
6. Keep those X livechat tabs open while capture is running.
7. Use the browser bridge/extension path for the smoothest local demo, or use **Start Workers** only on a capture machine where the app can launch Chrome normally.

This is intentionally an operator flow, not a viewer prompt. The public `/live` page and embeds should not ask ordinary viewers to connect X tabs.

## Production Workflow: Capture Agent

For a near-bulletproof website experience, keep the public app passive and run X capture separately:

```text
Market Bubble website / public app
  serves /live and /embed
  receives X messages at /api/capture/x-live
  never launches Chrome for visitors

Trusted capture machine
  runs npm run capture:x
  opens the configured X livechat pages in a dedicated Chrome/Edge profile
  posts captured rows into the public app
```

Public app settings:

```bash
X_LIVE_CHAT_TARGETS=blknoiz06,Banks
X_LIVE_CHAT_WORKER_AUTO_START=false
X_LIVE_CAPTURE_TOKEN=use-a-long-shared-token-in-production
```

Capture machine settings:

```bash
X_LIVE_CAPTURE_ENDPOINT=https://live.marketbubble.com/api/capture/x-live
X_LIVE_CAPTURE_TOKEN=the-same-long-shared-token
X_LIVE_CHAT_CHROME_PATH=
X_LIVE_CHAT_PROFILE_DIR=.data/x-live-chat-profile
X_LIVE_CHAT_TARGETS=blknoiz06,Banks
X_CAPTURE_AGENT_QUEUE_LIMIT=1000
```

Then run:

```bash
npm run capture:x
```

Use `X_CAPTURE_AGENT_DRY_RUN=true npm run capture:x` to validate the endpoint, browser path, and target list without launching Chrome.

## Server Worker Workflow: In-App Livechat Browser

If you know the broadcaster's X username, Market Bubble Live Chat can open X's livechat page directly from the server worker:

```text
https://x.com/<username>/livechat
```

This avoids devtools and avoids installing a browser extension.

1. Start Market Bubble Live Chat locally.
2. Open Source Settings.
3. Switch to `X`.
4. Put the X username in `Target Account`.
5. Click `Connect Sources`, then `Start Workers`.
6. A dedicated Chrome/Edge window opens to the broadcaster's X livechat page.
7. Log into X in that window if prompted.
8. Leave that window open while Market Bubble Live Chat captures visible chat messages.

The browser profile is stored separately at:

```text
.data/x-live-chat-profile
```

Optional environment variables:

```bash
X_LIVE_CHAT_CHROME_PATH=
X_LIVE_CHAT_PROFILE_DIR=.data/x-live-chat-profile
X_LIVE_CHAT_DEBUG_PORT=9223
X_LIVE_CHAT_SCAN_MS=1200
X_LIVE_CHAT_WORKER_AUTO_START=false
X_LIVE_CHAT_TARGETS=blknoiz06,Banks
```

If Chrome or Edge is installed in a non-standard location, set `X_LIVE_CHAT_CHROME_PATH` to the executable path.

`X_LIVE_CHAT_TARGETS` feeds the operator **Connect X Sources** list and the public source manifest. It does not launch Chrome on boot unless `X_LIVE_CHAT_WORKER_AUTO_START=true`. Keep worker auto-start off for hosted/public deployments. Prefer the capture agent when you need X capture without the admin dashboard.

If startup reports that Chrome exited before DevTools attached, the issue is below the X page itself: Chrome never opened the local debugging endpoint that the app uses for capture. On Windows, exit code `0xFFFF7001` / signed `-36863` usually means Chrome refused the debugging launch before binding the configured port. The most common local cause is an existing Chrome process already using `X_LIVE_CHAT_PROFILE_DIR` without remote debugging. Close any visible Market Bubble X capture Chrome window, then start capture again. If that still fails, set `X_LIVE_CHAT_PROFILE_DIR` to a fresh folder and sign into X in the new capture window.

If startup reports `spawn EPERM`, Windows denied launching Chrome from the server process before the app could even ask X for chat rows. This can happen when the app was started by an automation/background runner instead of a normal user terminal. For local demos, start the app from a regular terminal when using in-app X auto-capture, or use the browser extension/bridge workflow.

## Fallback Workflow: Browser Extension

Use the unpacked extension for a client-friendly workflow. It avoids devtools, console paste, and X CSP script-loading blocks.

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select:

```text
extensions/x-live-capture
```

6. Start Market Bubble Live Chat locally.
7. Open the X broadcast or `https://x.com/<username>/livechat` page in your browser while signed in to X.
8. Click the `Market Bubble X Capture` extension icon.
9. Click `Start`.
10. If prompted, click the visible X live chat area or one recent chat message.

Captured chat messages should appear in Market Bubble Live Chat with platform `X` and source kind `chat`.

## Last-Resort Workflow: Console Paste

1. Start Market Bubble Live Chat locally.
2. Open the X broadcast in your browser while signed in to X.
3. Open the browser devtools console on the X broadcast page.
4. Paste this loader:

```js
const script = document.createElement("script");
script.src = "http://localhost:4200/x-live-capture.js";
document.documentElement.appendChild(script);
```

5. A small `Market Bubble X Capture` panel appears if the browser allows the loader.
6. Click the visible X live chat area or one recent chat message.
7. Captured chat messages should appear in Market Bubble Live Chat with platform `X` and source kind `chat`.

If the browser blocks the loader, open `http://localhost:4200/x-live-capture.js`, copy the script contents, and paste the contents directly into the X page console.

To stop capture, click `Stop` in the capture panel or run:

```js
window.LSChatXLiveCapture?.stop();
```

## Local Fixture Test

If you cannot find a real X broadcast, use the bundled fixture page:

```text
http://localhost:4200/x-live-capture-test.html
```

Click `Start Capture`, then click the mock chat list when the capture panel asks for a chat area. Use `Add Message` to append more rows. Those rows should appear in Market Bubble Live Chat as X chat messages.

## Optional Tuning

Set these variables before loading the script:

```js
window.LS_CHAT_CAPTURE_CHANNEL = "StreamerName on X";
window.LS_CHAT_CAPTURE_ENDPOINT = "http://localhost:4200/api/capture/x-live";
window.LS_CHAT_CAPTURE_ROW_SELECTOR = '[role="listitem"]';
window.LS_CHAT_CAPTURE_SCAN_MS = 1000;
```

`LS_CHAT_CAPTURE_ROW_SELECTOR` is the escape hatch if X changes the broadcast chat DOM or if the generic parser captures too much or too little.

## Endpoint

The helper posts batches to:

```text
POST /api/capture/x-live
```

The endpoint accepts messages shaped like:

```json
{
  "sourceUrl": "https://x.com/i/broadcasts/example",
  "channelName": "X Live Broadcast",
  "messages": [
    {
      "platformMessageId": "browser:abc123",
      "username": "viewer",
      "displayName": "Viewer",
      "message": "hello from X live",
      "capturedAt": "2026-06-09T16:08:06.000Z"
    }
  ]
}
```

The server normalizes each entry into the existing `ChatMessage` contract as:

```json
{
  "platform": "x",
  "sourceKind": "chat"
}
```
