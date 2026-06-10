# X Live Capture Workaround

X does not currently expose a documented public API for livestream broadcast chat. This workaround captures visible chat rows from an X broadcast page that you have open in your browser and forwards them to LS Chat.

This is intentionally less clean than Twitch/Kick:

- it depends on X page markup
- it only sees chat that is rendered in your browser
- it requires the local LS Chat server to be running
- it may need selector tweaks if X changes the broadcast UI

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

## Preferred Workflow: In-App Livechat Browser

If you know the broadcaster's X username, LS Chat can open X's livechat page directly:

```text
https://x.com/<username>/livechat
```

This avoids devtools and avoids installing a browser extension.

1. Start LS Chat locally.
2. Open Source Settings.
3. Switch to `X`.
4. Put the X username in `Target Account`.
5. Click `Live Chat`.
6. A dedicated Chrome/Edge window opens to the broadcaster's X livechat page.
7. Log into X in that window if prompted.
8. Leave that window open while LS Chat captures visible chat messages.

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
```

If Chrome or Edge is installed in a non-standard location, set `X_LIVE_CHAT_CHROME_PATH` to the executable path.

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

6. Start LS Chat locally.
7. Open the X broadcast in your browser while signed in to X.
8. Click the `LS Chat X Capture` extension icon.
9. Click `Start`.
10. If prompted, click the visible X live chat area or one recent chat message.

Captured chat messages should appear in LS Chat with platform `X` and source kind `chat`.

## Last-Resort Workflow: Console Paste

1. Start LS Chat locally.
2. Open the X broadcast in your browser while signed in to X.
3. Open the browser devtools console on the X broadcast page.
4. Paste this loader:

```js
const script = document.createElement("script");
script.src = "http://localhost:4200/x-live-capture.js";
document.documentElement.appendChild(script);
```

5. A small `LS Chat X Capture` panel appears if the browser allows the loader.
6. Click the visible X live chat area or one recent chat message.
7. Captured chat messages should appear in LS Chat with platform `X` and source kind `chat`.

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

Click `Start Capture`, then click the mock chat list when the capture panel asks for a chat area. Use `Add Message` to append more rows. Those rows should appear in LS Chat as X chat messages.

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
