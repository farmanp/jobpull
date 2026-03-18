---
title: API Reference
slug: /reference/api
---

# API reference

## Public endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | health check |
| `GET` | `/api/meta` | board metadata |
| `GET` | `/api/stats` | totals, visible jobs, stale jobs, active sources, last crawl |
| `GET` | `/api/jobs` | job listing and filtering |
| `GET` | `/api/jobs/:id` | single job detail |
| `GET` | `/api/digest/today` | today’s grouped digest |

## `/api/jobs` query params

| Param | Meaning |
| --- | --- |
| `query` | title or company search |
| `pm_focus` | focus category filter |
| `remote_status` | `remote`, `hybrid`, `onsite`, `unknown` |
| `company` | exact company filter |
| `sort` | `newest_seen` or `newest_posted` |
| `limit` | 1–100 |
| `offset` | pagination offset |
| `include_stale` | set to `1` to include stale rows |

## Admin endpoint

```http
POST /api/admin/run-crawl
Authorization: Bearer YOUR_ADMIN_TOKEN
```

## Notes

- stale jobs are excluded from default public listings
- `/api/jobs/:id` can still return stale rows
- `/api/stats` exposes both `visibleJobs` and `staleJobs`
