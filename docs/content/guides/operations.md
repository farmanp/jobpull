---
title: Operations
slug: /guides/operations
---

# Operations guide

This guide covers the day-two tasks that keep a board healthy.

## Ownership and visibility

`jobpull` is personal-first in v1:

- one deployment has one board
- the board starts `private`
- the first owner claims it once with the deploy-created `ADMIN_TOKEN`
- after claim, the owner signs back in with emailed magic links

If you want other people to browse the board, switch visibility to `public` from `Admin`. Public visitors can browse a published board, but only the owner gets tracker/admin access in v1.

The ownership/browse policy is controlled by deployment config:

- `MAGIC_LINK_DELIVERY` decides whether owner sign-in links are emailed, shown directly, or disabled
- `BOARD_VISIBILITY_DEFAULT` controls the initial board visibility for a fresh install
- `ALLOW_UNCLAIMED_BROWSE` lets an unclaimed private board stay browseable for local/dev or demo deployments

## Migrations

Apply worker migrations whenever schema changes land:

```bash
cd worker
npx wrangler d1 migrations apply DB --local
```

For the Docker/Node path, worker migrations are applied against SQLite on startup.

## Stale jobs

Stale handling is soft-hide, not deletion.

Default behavior:

- jobs become stale after 14 days without being seen again
- stale jobs are hidden from default public listings
- stale rows remain queryable by ID
- `include_stale=1` exposes them in `/api/jobs`

## Recrawls

Manual recrawl:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/run-crawl \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Manual crawls do not send subscriber email. Digest delivery only runs after successful scheduled crawls.

## Email digests

The v1 notification channel is board-wide email delivery through Resend with double opt-in.

Default behavior:

- a subscriber must confirm by email before receiving digests
- one successful scheduled crawl can produce at most one digest send per subscriber
- unsubscribe links are included in subscriber emails
- manual admin test sends are available from `Admin` → `Notifications`

Required runtime config:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- optional `EMAIL_REPLY_TO`
- `PUBLIC_BASE_URL`
- `SESSION_SECRET` for owner sessions and magic-link sign-in

Operational checks:

- if the signup form says digests are not configured yet, check the notification provider config
- if confirmations or unsubscribe links break, verify `PUBLIC_BASE_URL`
- if digests stop sending, inspect the last notification run in the Admin `Notifications` section
- if you change the admin token, previously generated unsubscribe links will stop working until the next digest email is sent

## Troubleshooting checklist

- API error mentioning a missing DB column: re-apply local migrations
- board looks empty after a pack change: trigger a crawl
- jobs feel outdated: check `staleJobs` and `lastCrawl` in `/api/stats`
- digests not sending after a scheduled crawl: confirm Resend config and inspect `Admin` → `Notifications`
- provider errors: validate the upstream public feed before changing parser code

## What to back up

For Cloudflare, treat D1 as the source of truth.

For Docker:

- back up `./data/jobpull.sqlite`
- back up `./data/uploads` if you use the owner resume feature
- keep `.env.docker` safe
- keep your source and config choices documented
