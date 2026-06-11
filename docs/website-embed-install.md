# Website Embed Install

Last updated: 2026-06-11

Market Bubble Live Chat can be added to an existing website as an iframe. This is the lowest-friction install path because it keeps the app's CSS, WebSocket connection, stream embeds, and guest chat session isolated from the host website.

## Operator Install Panel

Open the operator console at `/`, then choose **Website Install** from the header. The panel shows the live public URL, full embed URL, chat-only embed URL, Market Bubble proof page URL, public config JSON URL, a short demo runbook, copy-ready iframe snippets, and non-secret readiness checks.

Use this panel as the handoff surface before launch. It should confirm that public/embed URLs are exposed, stream fallback is configured, signed native guest identity is enabled, at least one real chat source is tracked, and public-only mode is active when the deployment is meant to run without the admin dashboard.

Before a stakeholder demo, use the **Demo Runbook** card in that panel as the quick operator flow. It links to the proof page, live hub, chat-only embed, and embed handoff route while reflecting the readiness state from the same checks used by the install panel.

If the deployment exposes the operator dashboard, set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`. The public viewer routes stay available, but admin APIs and platform connection controls require the operator session.

Configure where the hosted product is allowed to be embedded:

```bash
EMBED_ALLOWED_ORIGINS=https://marketbubble.com,https://www.marketbubble.com
```

The server sends a `Content-Security-Policy` `frame-ancestors` header using that allowlist plus `'self'`. Add partner domains only when Market Bubble intentionally wants those sites to iframe the live hub.

## Full Live Hub

Use this when the website page should show the stream player, source switcher, combined chat, viewer count, and native Market Bubble composer:

```html
<iframe
  src="https://live.marketbubble.com/embed"
  title="Market Bubble Live"
  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
  style="width: 100%; height: 760px; border: 0; display: block;"
></iframe>
```

## Proof Page

The local proof-of-concept page lives at:

```text
/mock-marketbubble
```

It mirrors the current Market Bubble site direction and places the real `/embed` and `/embed?view=chat` surfaces into a website-like layout. Use it to demonstrate the product experience before editing the production website.

## Chat-Only Embed

Use this when the website already has a stream player and only needs the shared chat module:

```html
<iframe
  src="https://live.marketbubble.com/embed?view=chat"
  title="Market Bubble Shared Chat"
  style="width: 100%; height: 640px; border: 0; display: block;"
></iframe>
```

## Recommended Hosting

Best production shape:

```text
https://live.marketbubble.com/embed
```

embedded on:

```text
https://marketbubble.com
```

That same-site subdomain setup keeps guest chat cookies practical in modern browsers.

If the app is hosted on a completely different site, such as a Render or Railway domain, configure:

```bash
NATIVE_CHAT_SESSION_SAME_SITE=none
```

Only use `none` over HTTPS. Browsers require `Secure` cookies for `SameSite=None`, and some privacy settings may still block third-party iframe cookies. A first-party Market Bubble subdomain is the safer long-term launch path.

## Deployment Checklist

1. Deploy the app behind HTTPS.
2. Set `PUBLIC_LIVE_ONLY=true` if the website should expose only the viewer/embed experience.
3. Set `NATIVE_CHAT_SESSION_SECRET` to a long random value.
4. Configure the stream and chat source env vars for the event.
5. Confirm `GET /api/public/config` returns `publicUrl`, `fullEmbedUrl`, `chatEmbedUrl`, and `streamSources`.
6. Confirm `GET /api/health` shows the expected `configuration.securityHeaders.embedAllowedOrigins`.
7. Embed `/embed` or `/embed?view=chat` on the website.
8. Send a native chat message from the iframe and confirm the guest identity remains stable after refresh.
