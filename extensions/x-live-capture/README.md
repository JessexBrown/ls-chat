# LS Chat X Live Capture Extension

This unpacked Chrome/Edge extension captures visible chat rows from an open X broadcast page and forwards them to a local LS Chat server.

## Install

1. Open Chrome or Edge.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

```text
extensions/x-live-capture
```

Pin the extension if you want quick access from the toolbar.

## Use

1. Start LS Chat locally.
2. Open an X broadcast URL such as:

```text
https://x.com/i/broadcasts/1rGmqqbWLQLGy
```

3. Click the `LS Chat X Capture` extension icon.
4. Keep the endpoint as:

```text
http://localhost:4200/api/capture/x-live
```

5. Optionally set a channel label.
6. Click `Start`.
7. If the extension asks you to select the chat area, click the visible chat panel or one recent chat message on the X page.

Captured rows should appear in LS Chat as platform `X`.

## Token

If the server has `X_LIVE_CAPTURE_TOKEN` set, put the same value in the extension `Token` field before clicking `Start`.

## Troubleshooting

- If the popup says `Open an X broadcast tab first`, make sure the active tab URL is an X broadcast page.
- If no messages appear, click `Select Area` and choose the chat panel manually.
- If posting fails, confirm LS Chat is running and the server has been restarted after adding the capture endpoint.
- If X changes its page markup, the content script selector may need adjustment.
