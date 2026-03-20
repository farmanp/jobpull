---
title: Cloudflare Quick Start
slug: /getting-started/cloudflare-quickstart
---

# Cloudflare quick start

This is the reference deployment path for `jobpull`.

## Prerequisites

- Node.js 20+
- npm
- a Cloudflare account
- Wrangler access

## Fast path

```bash
git clone https://github.com/farmanp/jobpull.git
cd jobpull
npm install
npm run setup
```

The setup CLI will:

1. check local prerequisites
2. ask for your board name, contact email, D1 database name, and starter pack
3. create or patch the local Cloudflare config
4. apply migrations
5. seed the selected starter pack
6. generate local secrets and frontend env files

The board starts private by default. The first time you open the web UI, you claim it once with the deploy-created `ADMIN_TOKEN`, choose the owner email, and then sign in with emailed magic links after that.

Owner auth and browse behavior are env-driven:

- `MAGIC_LINK_DELIVERY=disabled|resend|console`
- `BOARD_VISIBILITY_DEFAULT=private|public`
- `ALLOW_UNCLAIMED_BROWSE=true|false`

For local development, `console` delivery plus `ALLOW_UNCLAIMED_BROWSE=true` is the least-friction setup.

## Local development

```bash
# terminal 1
npm run dev:worker

# terminal 2
npm run dev:web
```

Default local ports:

- worker API: `http://127.0.0.1:8787`
- web app: `http://127.0.0.1:5173`

Open the web app, claim the board, and finish setup there. While the board is private, only the owner session can browse jobs and use tracker/admin features.

## Trigger a crawl

```bash
curl -X POST http://127.0.0.1:8787/api/admin/run-crawl \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

The web owner flow is the normal way to operate the board after claim. The bearer token still exists for CLI and recovery flows.

## Common local gotcha

After schema changes, your local D1 database needs fresh migrations. If the API starts failing with database-column errors, run:

```bash
cd worker
npx wrangler d1 migrations apply DB --local
```

## Deploy

```bash
cd worker
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler deploy
```

Then deploy `web/dist` to Cloudflare Pages with `VITE_API_BASE` pointing at the worker URL.

`SESSION_SECRET` is required for owner sessions and magic-link sign-in.

## Enable email digests

Subscriber digests use Resend with double opt-in. For Cloudflare:

1. Set these non-secret Worker vars in `worker/wrangler.toml`:
   - `EMAIL_FROM`
   - optional `EMAIL_REPLY_TO`
   - `PUBLIC_BASE_URL`
2. Save the Resend API key as a Worker secret:

```bash
cd worker
npx wrangler secret put RESEND_API_KEY
```

3. Redeploy the Worker.

`PUBLIC_BASE_URL` must be the public board URL so confirmation and unsubscribe links resolve correctly.

## Publish later

After you claim the board, it stays private until you switch it to `public` from `Admin` in the web app. That lets you use `jobpull` as a personal board first, then publish it later if you decide to share it.
