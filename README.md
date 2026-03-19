# jobpull

`jobpull` is a self-hosted job board starter kit. It crawls official public feeds, classifies roles, hides stale listings, and gives you a board you can tune for a role, team, or community.

The public docs live at [https://farmanp.github.io/jobpull/](https://farmanp.github.io/jobpull/). Use the docs site for detailed setup, customization, deployment, and operations.
Docs changes on `main` publish there through GitHub Pages via [`.github/workflows/docs.yml`](.github/workflows/docs.yml).

## What it includes

- Public read-only feed support for Greenhouse, Lever, Ashby, Recruitee, Personio XML, and generic JSON
- Starter packs for `product`, `engineering`, `design`, and `gtm`
- Cloudflare reference deployment and a portable Docker/Node path
- CLI flows for setup, packs, sources, crawl, and status

## Quick start

```bash
git clone https://github.com/farmanp/jobpull.git
cd jobpull
npm install
npm run setup
```

Then start the local services:

```bash
npm run dev:worker
npm run dev:web
npm run dev:docs
```

## Read the docs

- Docs home: [jobpull docs](https://farmanp.github.io/jobpull/)
- Cloudflare quick start: [Cloudflare deployment](https://farmanp.github.io/jobpull/docs/getting-started/cloudflare-quickstart)
- Docker quick start: [Docker Compose](https://farmanp.github.io/jobpull/docs/getting-started/docker-compose)
- Starter packs: [Starter packs](https://farmanp.github.io/jobpull/docs/guides/starter-packs)
- Customization: [Customization guide](https://farmanp.github.io/jobpull/docs/guides/customization)
- Source feeds: [Source feeds](https://farmanp.github.io/jobpull/docs/guides/source-feeds)
- Operations: [Operations guide](https://farmanp.github.io/jobpull/docs/guides/operations)
- API reference: [API reference](https://farmanp.github.io/jobpull/docs/reference/api)

## Security

Never commit `.dev.vars`, `.env*`, or local SQLite files.

## License

[MIT](LICENSE)
