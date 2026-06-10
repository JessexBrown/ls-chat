# Kick Webhook URL and Hosting Options

Last updated: 2026-06-09

Kick chat ingestion requires a public HTTPS URL that routes to this app's webhook endpoint:

```text
https://your-public-host.example/api/webhooks/kick
```

Kick OAuth also needs a public redirect URL when you want the browser authorization flow to work through a tunnel:

```text
https://your-public-host.example/api/auth/kick/callback
```

Localhost is not enough for webhooks because Kick must be able to send `chat.message.sent` webhook requests to your server over the public internet. OAuth can use localhost in some cases, but using the same public ngrok/host base for both Kick dashboard fields keeps local testing simpler.

## Recommendation

For the next development step, use a local tunnel first. It lets you keep the app on your machine while Kick sends real webhook traffic to it.

Best first choice:

- ngrok if you want webhook inspection and replay while debugging.
- Cloudflare Quick Tunnel if you want the fastest temporary public URL and do not care if the URL changes.

Move to hosted deployment when:

- you want a stable webhook URL that does not change between test sessions
- you want Kick events to arrive while your local machine is off
- you want OAuth callback URLs and webhook URLs to be stable for external testers

## Option 1: ngrok for Local Testing

Run the app locally:

```bash
npm run dev
```

In another terminal:

```bash
ngrok http 4200
```

Copy the HTTPS forwarding URL and append the Kick webhook path:

```text
https://your-ngrok-domain.ngrok-free.app/api/webhooks/kick
```

Also append the Kick OAuth callback path for the redirect URL:

```text
https://your-ngrok-domain.ngrok-free.app/api/auth/kick/callback
```

Use that full value in:

- the Kick developer app webhook URL setting
- the Kick developer app redirect URL setting
- `.env` as `KICK_WEBHOOK_URL` and `KICK_REDIRECT_URI`

During local development, the Express app serves Vite middleware. Vite blocks unknown public hostnames by default, so tunneled hosts such as ngrok must be allowed. The app's Vite config automatically allows the hostnames from `KICK_WEBHOOK_URL` and `KICK_REDIRECT_URI`; for any extra public dev hosts, add them to `.env`:

```env
DEV_ALLOWED_HOSTS=your-ngrok-domain.ngrok-free.app
```

The local dev server also binds Vite hot reload to the same Express server so tunneled pages do not try to connect to a separate random HMR port such as `:24678`. In production, the built client is served statically and Vite HMR is not involved.

Pros:

- built for local webhook testing
- gives a public HTTPS endpoint for localhost
- includes traffic inspection and request replay, which is useful while validating signatures and payloads

Tradeoff:

- temporary URLs may need to be updated in Kick unless you configure a stable domain in ngrok

Official reference: https://ngrok.com/docs/guides/share-localhost/webhooks

## Option 2: Cloudflare Quick Tunnel for Local Testing

Run the app locally:

```bash
npm run dev
```

In another terminal:

```bash
cloudflared tunnel --url http://localhost:4200
```

Copy the generated `trycloudflare.com` URL and append:

```text
/api/webhooks/kick
```

For OAuth, append:

```text
/api/auth/kick/callback
```

Pros:

- very fast setup
- automatic HTTPS
- no open local ports required
- no account required for quick tunnels

Tradeoff:

- quick tunnel URLs are temporary, so you may need to update the Kick developer app each time

Official reference: https://try.cloudflare.com/

## Option 3: Render for Stable Hosted Testing

Render is a good first hosted option for this app because it supports a long-running Node/Express web service and provides a public HTTPS `onrender.com` URL.

Suggested Render settings:

```text
Build Command: npm install && npm run build
Start Command: npm start
```

Set secrets/environment variables in the Render dashboard instead of committing them:

```text
CHAT_HISTORY_LIMIT=500
DEMO_CHAT_ENABLED=false
TWITCH_REDIRECT_URI=https://your-service.onrender.com/api/auth/twitch/callback
KICK_WEBHOOK_URL=https://your-service.onrender.com/api/webhooks/kick
KICK_REDIRECT_URI=https://your-service.onrender.com/api/auth/kick/callback
```

Pros:

- stable public HTTPS URL
- Git-based deploys
- fits the app's Express server and WebSocket model

Tradeoff:

- more setup than a local tunnel
- free instances have platform limitations, so use an appropriate service type for reliable live testing

Official references:

- https://render.com/docs/web-services
- https://render.com/docs/deploy-node-express-app

## Option 4: Fly.io for a More Ops-Oriented Deployment

Fly.io is a good fit when you want a small always-on Node service and are comfortable with CLI-driven deployment. It can provision public IPs for HTTP services during deploy.

Pros:

- good fit for long-running services
- region control
- CLI-driven deploy workflow

Tradeoff:

- more infrastructure decisions than Render
- usually best once the app is closer to production shape

Official reference: https://fly.io/docs/launch/deploy/

## What I Would Do Next

Use ngrok for the first Kick proof-of-life:

1. Start `npm run dev`.
2. Run `ngrok http 4200`.
3. Put `https://<ngrok-domain>/api/webhooks/kick` in Kick's developer app webhook setting.
4. Put `https://<ngrok-domain>/api/auth/kick/callback` in Kick's developer app redirect setting.
5. Put those values into `KICK_WEBHOOK_URL` and `KICK_REDIRECT_URI`.
6. Fill Kick credentials.
7. Click OAuth in the app's Kick settings drawer.

After we see real Kick messages land, deploy to Render or Fly for a stable callback URL.
