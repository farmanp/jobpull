---
title: Docker Compose
slug: /getting-started/docker-compose
---

# Docker Compose quick start

Use this path when you want a single portable app container with SQLite and same-origin API + frontend serving.

The board starts private by default. The first time you open it, claim it once with the deploy-created `ADMIN_TOKEN`, choose the owner email, and then use emailed magic links after that.

## What runs in the container

- the Node server adapter
- the existing worker API/crawler logic
- worker migrations applied against SQLite on startup
- the built frontend served from the same origin
- an internal cron scheduler using the same cron string shape as Cloudflare

## First run

```bash
npm install
cp .env.docker.example .env.docker
docker compose up --build
```

## Important environment variables

Set these in `.env.docker`:

```env
ADMIN_TOKEN=change-me
SESSION_SECRET=replace-me
PORT=8787
DB_PATH=/data/jobpull.sqlite
UPLOADS_DIR=/data/uploads
CRON_SCHEDULE=0 7 * * *
USER_AGENT=JobPullBot/1.0 (+contact:you@example.com)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=JobPull <digest@example.com>
EMAIL_REPLY_TO=support@example.com
PUBLIC_BASE_URL=http://127.0.0.1:8787
STALE_THRESHOLD_DAYS=14
```

`PUBLIC_BASE_URL` should match the external URL users will open in the browser. The email digest feature uses it for confirmation and unsubscribe links.

`SESSION_SECRET` is required for owner sessions and magic-link sign-in. `UPLOADS_DIR` is where the server stores the owner resume file when you use the Docker path.

Owner auth and browse behavior are env-driven:

- `MAGIC_LINK_DELIVERY=disabled|resend|console`
- `BOARD_VISIBILITY_DEFAULT=private|public`
- `ALLOW_UNCLAIMED_BROWSE=true|false`

For local or demo-style Docker runs, `MAGIC_LINK_DELIVERY=console` is useful because the UI can open the generated owner link directly without email.

## Runtime shape

- app URL: `http://127.0.0.1:8787`
- persistent DB file: `/data/jobpull.sqlite`
- volume mount: `./data:/data`

Open the app, claim the board, and finish setup from the browser. While the board is private, only the owner session can browse jobs and use tracker/admin features.

## When to choose Docker instead of Cloudflare

Choose Docker if you want:

- one service instead of Worker + Pages
- same-origin API and frontend without extra deployment steps
- a VPS-friendly deployment target
- a migration path to other container hosts later

## Caveat

On non-Docker hosts, the Node server adapter shells out to the `sqlite3` CLI. Inside Docker, that binary is installed in the image for you.

## Email digests

Subscriber digests are sent only after successful scheduled crawls, never after manual admin crawls. Once the env vars above are set, the public board exposes a "Get the daily digest" signup form and the Admin UI gains a `Notifications` section for readiness checks and test sends.

## Publish later

After you claim the board, it stays private until you flip it to `public` from `Admin`. That keeps the default flow personal-first while still letting you publish the board later.
