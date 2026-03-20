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
| `POST` | `/api/subscriptions` | start a double opt-in daily digest subscription |
| `GET` | `/subscribe/confirm?token=...` | confirm a pending subscription |
| `GET` | `/subscribe/unsubscribe?token=...` | unsubscribe an active subscriber |

When `visibility = private`, anonymous requests to `/api/stats`, `/api/jobs`, `/api/jobs/:id`, and `/api/digest/today` are blocked. `/api/meta` still returns enough information for the app to show the board shell and claim/sign-in flow.

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

## Admin endpoints

```http
POST /api/admin/run-crawl
Authorization: Bearer YOUR_ADMIN_TOKEN
```

```http
GET /api/admin/notifications
Authorization: Bearer YOUR_ADMIN_TOKEN
```

```http
POST /api/admin/notifications/test
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{ "email": "you@example.com" }
```

## Owner auth endpoints

```http
POST /api/auth/claim
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{ "email": "owner@example.com" }
```

```http
POST /api/auth/request-link
Content-Type: application/json

{ "email": "owner@example.com" }
```

```http
GET /auth/verify?token=...
POST /api/auth/logout
GET /api/me
```

The board can only be claimed once. After claim, the owner uses emailed magic links and session cookies for the web app. The deploy-created admin token remains available for CLI/recovery flows and bearer-protected admin APIs.

## Owner workspace endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/me/jobs` | tracked jobs for the signed-in owner |
| `PUT` | `/api/me/jobs/:jobId/state` | update favorite, status, and notes |
| `GET` | `/api/me/profile` | owner profile |
| `PUT` | `/api/me/profile` | update owner profile |
| `POST` | `/api/me/resume` | upload one active PDF resume |
| `DELETE` | `/api/me/resume` | remove the active resume |

## Subscription flow

- `POST /api/subscriptions` accepts `{ "email": "reader@example.com" }`
- success responses are intentionally neutral so the public form does not leak subscriber status
- confirmation and unsubscribe endpoints return simple HTML pages for browser use
- only active subscribers receive scheduled daily digests

## Notes

- stale jobs are excluded from default public listings
- `/api/jobs/:id` can still return stale rows
- `/api/stats` exposes both `visibleJobs` and `staleJobs`
- public subscriber email is sent only after scheduled crawls with `success` or `partial` status
- manual admin crawls never trigger subscriber delivery
- owner tracking state is private to the board owner
- v1 apply flow is external handoff plus tracking, not generic in-app ATS submission
