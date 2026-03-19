---
title: Starter Packs
slug: /guides/starter-packs
---

# Starter packs

Starter packs are the preferred onboarding path. They let you launch a focused board without hand-editing SQL or regex config on day one.

## Available packs

- `product`
- `engineering`
- `design`
- `gtm`

## What a pack changes

Applying a pack will:

- update the board tagline
- update include and exclude role patterns
- update focus categories
- update tag keywords
- upsert a small set of managed starter sources

Applying a pack will **not**:

- delete custom sources
- overwrite your `boardName`
- overwrite your `contactEmail`

## Commands

```bash
npm run cli -- packs list
npm run cli -- packs show product
npm run cli -- packs apply engineering
```

## Recommended usage

Start with the closest pack, crawl once, inspect results, then tune from there. Packs are a baseline, not the final state.
If you need to change the target role or branding after the first pass, use the [Customization guide](./customization.md).

## Managed starter sources

Each pack seeds stable source IDs for:

- RemoteOK
- Remotive
- Arbeitnow
- Working Nomads

Reapplying a pack updates those managed rows instead of creating duplicates.
