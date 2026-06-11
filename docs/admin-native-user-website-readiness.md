# Admin, Native User, and Website Readiness Plan

Last updated: 2026-06-10

## Goal

Market Bubble Live Chat needs to move from a local operator tool into a production website feature. The next architecture step is to separate who can administer the system, who can chat natively, and how the public Market Bubble site consumes the experience out of the box.

## Role Model

### Operators and Admins

Admins are trusted Market Bubble staff. They can:

- connect Twitch and Kick OAuth accounts
- manage tracked broadcasters and X livechat capture targets
- configure stream sources, dashboard title, native chat label, and runtime limits
- view expanded stats and integration health
- eventually moderate native chat with delete, timeout, ban, and hold actions

Production admin access should not live at an unprotected public root route. The intended path is:

- `/admin`: protected operator console
- `/live`: public viewer hub
- `/api/admin/*`: authenticated admin-only APIs
- `/api/public/*`: public read APIs
- `/api/native-chat/*`: public guest-session and write APIs with rate limiting, origin checks, and identity controls

### Native Viewers

Native viewers are people chatting directly on Market Bubble. The current local guest ID is useful for a prototype, but production should move in phases:

1. Signed guest session: server issues an HttpOnly session cookie and a stable guest identity. Viewers cannot choose arbitrary names.
2. Claimed display name: viewers can choose a display name tied to the signed guest session, with uniqueness and moderation checks.
3. Account-backed identity: viewers log in with Market Bubble auth, email magic link, or a social provider. This unlocks durable profiles, trusted badges, and moderation history.

Until account-backed identity exists, native chat should be treated as semi-anonymous and moderateable, not trusted.

### Integration Accounts

Twitch, Kick, and X credentials are service/integration secrets. Viewers should never see them. OAuth tokens, webhook secrets, and capture tokens should be server-only, encrypted at rest when moved to a database, and rotatable from the admin console.

## Website Integration

### Public-Only Env Mode

Some deployments should skip the admin dashboard entirely and treat `/live` as the only product surface. This is useful when Market Bubble wants to configure a known event upfront with environment variables and does not want operators logging into a dashboard.

Enable it with:

```bash
PUBLIC_LIVE_ONLY=true
```

Supported aliases are `MARKETBUBBLE_PUBLIC_ONLY=true` and `APP_MODE=public`.

In public-only mode:

- `/` and `/admin` redirect to `/live`
- admin/OAuth/settings APIs return `404`
- public viewer APIs remain available: `/api/public/config`, `/api/messages` GET, `/api/sources`, `/api/emotes/betterttv/*`
- native chat remains available at `/api/native-chat/session` and `/api/native-chat/messages`
- platform ingestion remains available through Twitch/Kick webhooks and the X capture bridge
- WebSocket chat remains available at `/ws`

The intended upfront env configuration is:

```bash
PUBLIC_LIVE_ONLY=true
MARKETBUBBLE_DASHBOARD_TITLE=Market Bubble Live
MARKETBUBBLE_CHAT_LABEL=Market Bubble
MARKETBUBBLE_STREAM_LABEL=Primary Feed
MARKETBUBBLE_STREAM_EMBED_URL=https://www.twitch.tv/example
MARKETBUBBLE_STREAM_WATCH_URL=https://www.twitch.tv/example
CHAT_HISTORY_LIMIT=500
NATIVE_CHAT_RATE_LIMIT=8
NATIVE_CHAT_RATE_WINDOW_MS=10000
```

Real external chat still needs platform credentials or webhooks:

- Twitch: provide `TWITCH_CLIENT_ID`, `TWITCH_USER_ACCESS_TOKEN`, `TWITCH_USER_ID`, `TWITCH_BROADCASTER_USER_ID`, and set `TWITCH_EVENTSUB_ENABLED=true`.
- Kick: provide `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_WEBHOOK_URL`, `KICK_BROADCASTER_USER_ID`, and set `KICK_AUTO_SUBSCRIBE=true`.
- X livechat capture: provide `X_LIVE_CHAT_CHROME_PATH` and `X_LIVE_CHAT_TARGETS`, where targets are comma-separated usernames or `https://x.com/<user>/livechat` URLs.

This mode is not a replacement for production admin auth forever. It is the safest low-friction launch mode when the event configuration is known before deployment.

### Recommended Production Shape

The cleanest launch path is to host the live hub as a first-party route:

- `https://marketbubble.com/live` routes to this app through the production host or reverse proxy.
- The app serves the stream player, source switcher, combined chat, native composer, viewer preferences, and public stats shell.
- Admin APIs are protected separately and should not be exposed through the public viewer page.

This gives viewers one canonical page and avoids iframe sizing, cookie, and cross-origin WebSocket problems.

### Embeddable Mode

If the existing Market Bubble site must embed the hub instead of routing to it directly, use an iframe for the public viewer surface:

```html
<iframe
  src="https://live.marketbubble.com/embed"
  title="Market Bubble Live"
  allow="autoplay; fullscreen; picture-in-picture"
></iframe>
```

For chat-only placement next to an existing site-owned stream player, use `https://live.marketbubble.com/embed?view=chat`.

An iframe is safer than a script widget for the full stream-plus-chat experience because it isolates CSS, avoids dependency collisions with the Framer site, and keeps WebSocket/session behavior under this app's control.

### Out-Of-The-Box Readiness Checklist

Before handing this to Market Bubble as a site feature, the app should include:

- setup wizard for public base URL, allowed origins, callback URLs, and webhook URLs
- admin auth guard before any integration controls are available
- public health indicator that hides raw integration errors from viewers
- clear empty states when no stream source or chat source is configured
- production environment template for `marketbubble.com` and local tunnel development
- deployment notes for reverse proxy headers, WebSocket upgrades, and HTTPS
- database-backed config/session storage instead of `.data/*.json`
- durable native chat identity and moderation storage
- backup and token rotation procedure

## Implementation Sequence

1. Admin separation: split the root route into `/admin`, add an auth middleware placeholder, and move admin-only controls/API calls behind that boundary.
2. Public route hardening: keep `/live` public, support `PUBLIC_LIVE_ONLY=true`, trim all admin-only data from public config responses, and make public errors viewer-safe.
3. Native session identity: replace browser-only guest identity with a signed server-issued guest session cookie and server-side identity record.
4. Persistence: introduce a database for live sessions, integration sessions, native users, moderation actions, and message/event analytics.
5. Moderation: add native message delete, timeout, ban, blocked terms, duplicate-message control, and link policy.
6. Website launch packaging: document reverse proxy/WebSocket setup, environment variables, callback URLs, and iframe/full-route options.
7. Analytics: persist viewer samples, source switches, message counts, native sends, and moderation actions for post-show reporting.

## Current Recommendation

For the next build phase, prioritize admin separation and signed native guest sessions before expanding native chat features. This keeps the product direction strong without letting public chat become a moderation problem before Market Bubble has the tools to manage it.
