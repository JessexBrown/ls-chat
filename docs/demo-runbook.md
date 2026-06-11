# Market Bubble Live Demo Runbook

Last updated: 2026-06-11

This is the step-by-step guide for running the stakeholder demo. The goal is to show that Market Bubble can host a polished native live hub that combines Twitch, Kick, X livechat capture, and Market Bubble's own first-party chat without asking viewers to install anything or open extra tabs.

## Demo Links

Production demo host:

```text
https://marketbubble-live-chat.onrender.com
```

Use these routes during the demo:

```text
https://marketbubble-live-chat.onrender.com/live
https://marketbubble-live-chat.onrender.com/embed
https://marketbubble-live-chat.onrender.com/embed?view=chat
https://marketbubble-live-chat.onrender.com/mock-marketbubble
https://marketbubble-live-chat.onrender.com/api/public/config
```

Admin dashboard:

```text
https://marketbubble-live-chat.onrender.com/
```

## Roles

Presenter:

- opens the public viewer pages
- narrates the product value
- sends a native Market Bubble chat message
- shows the embed/proof page

Operator:

- logs into admin
- confirms Twitch/Kick are connected
- runs the X capture agent
- keeps the capture terminal and X Chrome profile open

For a small demo, one person can do both.

## Pre-Demo Checklist

Do these 15-30 minutes before the demo.

1. Open the Render service and confirm the latest deployment is live.
2. Open `/api/public/config`.
3. Confirm these fields exist:

```text
dashboard.publicUrl
dashboard.embedUrl
dashboard.chatEmbedUrl
dashboard.streamSources
kickWebhook
xLiveChatCapture
```

4. Confirm Render is warm by opening `/live`.
5. Log into `/` with `ADMIN_PASSWORD`.
6. Confirm Twitch is connected and receiving messages.
7. Confirm Kick diagnostics show valid webhook traffic:

```text
kickWebhook.diagnostics.received > 0
kickWebhook.diagnostics.invalidSignature = 0
```

8. Confirm X is configured but passive on Render:

```text
xLiveChatCapture.workerAutoStart = false
xLiveChatCapture.tokenRequired = true
```

9. Start X capture from the operator machine.

PowerShell:

```powershell
cd C:\Users\jb\jb_code\personal-projs\ls-chat

$env:X_LIVE_CAPTURE_ENDPOINT="https://marketbubble-live-chat.onrender.com/api/capture/x-live"
$env:X_LIVE_CAPTURE_TOKEN="<token-from-render>"
$env:X_LIVE_CHAT_TARGETS="blknoiz06,Banks"

npm run capture:x
```

10. Confirm X messages appear on `/live`.
11. Keep the capture terminal open.
12. Keep the X Chrome windows/tabs open and signed in.

## Demo Script

### 1. Product Overview

Open:

```text
https://marketbubble-live-chat.onrender.com/live
```

Say:

```text
This is the Market Bubble live hub. It combines live chat from Twitch, Kick, X, and Market Bubble's own native chat into one viewer-facing experience.
```

Point out:

- stream player
- source selector
- combined chat
- platform logos
- viewer count
- native Market Bubble composer

### 2. Combined Chat

Show incoming messages from multiple platforms.

Say:

```text
The chat keeps the source clear. Viewers can see where a message came from, while Market Bubble owns the combined conversation.
```

If the chat is fast-moving, scroll up briefly and show that the chat pauses instead of yanking the message away.

### 3. Native Market Bubble Chat

Send a message from the composer on `/live`.

Say:

```text
The native chat is the long-term differentiator. Twitch, Kick, and X are inputs, but Market Bubble becomes the shared room.
```

Open a second browser tab to `/live` if needed and confirm the message appears there too.

### 4. Stream Source Switching

Use the source dropdown near the stream.

Say:

```text
Viewers can choose the playback source they prefer while staying in the shared Market Bubble chat.
```

Mention examples:

- one viewer may prefer Kick
- another may prefer Twitch
- Market Bubble chat remains central either way

### 5. Website Embed

Open:

```text
https://marketbubble-live-chat.onrender.com/embed
```

Say:

```text
This is the drop-in full hub embed. It can be placed on a Market Bubble page with an iframe.
```

Then open:

```text
https://marketbubble-live-chat.onrender.com/embed?view=chat
```

Say:

```text
This is the chat-only embed for pages that already have their own stream player or layout.
```

### 6. Market Bubble Proof Page

Open:

```text
https://marketbubble-live-chat.onrender.com/mock-marketbubble
```

Say:

```text
This shows how the product can sit inside a Market Bubble-style website experience instead of feeling like a separate tool.
```

### 7. Admin View

Open:

```text
https://marketbubble-live-chat.onrender.com/
```

Log in with `ADMIN_PASSWORD`.

Show:

- live chat control room
- Source Settings
- Website Install
- Stats
- moderation controls if native messages exist

Say:

```text
The admin dashboard is protected and separate from the public viewer experience. Viewers do not see OAuth, capture setup, or operational controls.
```

## X Explanation

Use this wording if asked about X:

```text
Twitch and Kick have server-side integration paths. X does not currently expose a clean broadcast livechat API, so for the demo we run a trusted operator-side capture agent. It watches the livechat pages and sends the messages into the same server pipeline. Viewers never install anything, never authenticate with X, and never see popups.
```

Production direction:

```text
For production, the X capture agent should move from a laptop to a dedicated capture machine or small browser automation host with a persistent signed-in X profile.
```

## Health Checks

Public config:

```text
/api/public/config
```

Expected:

```text
200 OK
dashboard.streamSources has Twitch/Kick/X entries
xLiveChatCapture.tokenRequired = true
kickWebhook.diagnostics.invalidSignature = 0
```

Messages:

```text
/api/messages
```

Expected after sources are active:

```text
messages include platform: twitch
messages include platform: kick
messages include platform: x
messages include platform: marketbubble after native chat test
```

## Troubleshooting During Demo

If Render is slow:

- open `/live`
- wait 30-60 seconds
- Render free instances may cold start

If Twitch is not showing:

- log into admin
- reconnect Twitch OAuth
- subscribe to the target channel again

If Kick is not showing:

- open `/api/public/config`
- check `kickWebhook.diagnostics`
- `invalidSignature > 0` means `KICK_PUBLIC_KEY_PEM` is wrong
- `broadcasterNotTracked > 0` means the wrong Kick channel is tracked
- `received = 0` means Kick is not reaching the webhook URL

If X is not showing:

- confirm `npm run capture:x` is still running
- confirm `X_LIVE_CAPTURE_TOKEN` is set in the operator terminal
- confirm the X tabs are open and signed in
- confirm there is actual visible chat on the X livechat pages

If native chat fails:

- refresh `/live`
- check `/api/native-chat/session`
- confirm cookies are allowed in the browser

## Post-Demo Notes

Items to discuss after the demo:

- move X capture to a dedicated machine
- add durable storage for native chat and moderation
- add account-backed Market Bubble identity
- add persistent analytics/stats
- decide whether the production surface is `live.marketbubble.com` or embedded under `marketbubble.com`
