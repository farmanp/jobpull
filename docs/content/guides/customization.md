---
title: Customization
slug: /guides/customization
---

# Customization guide

Use this guide when you want to change what `jobpull` keeps, how it classifies jobs, and where it runs.

## Start with a pack

Starter packs are the fastest way to launch a board with sane defaults.

```bash
npm run cli -- packs list
npm run cli -- packs show product
npm run cli -- packs apply engineering
```

Available packs:

- `product`
- `engineering`
- `design`
- `gtm`

Pack application updates role targeting, focus categories, tag keywords, and managed starter sources without deleting custom sources.

## Tune the role filters

The board keeps jobs based on the patterns in `worker/src/config.ts`.

Common changes:

- adjust `titleIncludePatterns` to match the roles you want
- adjust `titleExcludePatterns` to remove adjacent roles
- change `remoteOnly` if you want onsite or hybrid roles
- edit `focusCategories` to control the filters shown in the UI
- update `tagKeywords` to drive auto-tags and digest grouping

## Add sources

Prefer the CLI:

```bash
npm run cli -- sources
```

The built-in read-only providers are:

- Greenhouse
- Lever
- Ashby
- Recruitee
- Personio XML
- Generic JSON

See [Source Feeds](./source-feeds.md) for the exact config shapes and validation rules.

## Brand the board

Update the board name and tagline through the setup flow or the configuration CLI, then use the docs and landing page copy as a reference for the public-facing language.

## Manage the schedule

The default crawl cadence is daily. For the Cloudflare path, update the cron in `worker/wrangler.toml`. For Docker, change `CRON_SCHEDULE` in `.env.docker`.

## Handle stale jobs

`jobpull` soft-hides stale jobs instead of deleting them. Re-seen jobs are reactivated on the next crawl.

## When to use Docker

Use Docker Compose if you want:

- one portable app container
- same-origin API and frontend
- SQLite on a VPS or local machine
- a deployment path that is not tied to Cloudflare
