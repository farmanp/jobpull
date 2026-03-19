---
title: Source Feeds
slug: /guides/source-feeds
---

# Source feeds

`jobpull` is feed-first. Prefer official public JSON or XML endpoints instead of brittle HTML scraping.

## Built-in read-only sources

| Provider | Type | Config |
| --- | --- | --- |
| Greenhouse | `greenhouse` | `boardToken`, optional `departmentKeywords` |
| Lever | `lever` | `site`, optional `teamKeywords` |
| Ashby | `ashby` | `organizationSlug` |
| Recruitee | `recruitee` | `subdomain` |
| Personio XML | `personio_xml` | `companySlug`, optional `language` |
| Generic JSON | `remote_json` | `url`, optional `sourceLabel`, optional `assumeRemote` |

## Preferred setup flow

```bash
npm run cli -- sources
```

That flow writes the correct `type`, `base_url`, and `config_json` shape for supported providers.
If you are deciding how to rebrand the board or which preset to start from, see the [Customization guide](./customization.md).

## Validation rule for new providers

Before adding a new fetcher:

1. find a real public tenant
2. hit the official public feed without credentials
3. confirm it returns a stable title, canonical URL, company, location/workplace info, and description
4. only then add the new source type to the repo

## Legacy manual path

`worker/seeds/sources.sql` still exists as a manual example, but it is no longer the preferred onboarding path for new installs.
