import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import styles from "./index.module.css";

const cards = [
  {
    title: "Cloudflare Quick Start",
    body: "Bring up the Worker, D1, and frontend with the CLI-first setup flow.",
    to: "/docs/getting-started/cloudflare-quickstart"
  },
  {
    title: "Docker Compose",
    body: "Run the portable Node + SQLite deployment with same-origin docs and API.",
    to: "/docs/getting-started/docker-compose"
  },
  {
    title: "Starter Packs",
    body: "Use product, engineering, design, or GTM presets without hand-editing SQL.",
    to: "/docs/guides/starter-packs"
  },
  {
    title: "Source Feeds",
    body: "Configure Greenhouse, Lever, Ashby, Recruitee, Personio XML, and JSON feeds.",
    to: "/docs/guides/source-feeds"
  },
  {
    title: "Operations",
    body: "Handle migrations, stale jobs, recrawls, and local troubleshooting cleanly.",
    to: "/docs/guides/operations"
  },
  {
    title: "API Reference",
    body: "See the public and admin endpoints, query params, and stale-job controls.",
    to: "/docs/reference/api"
  }
];

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Docs"
      description="Docusaurus documentation site for job_pull setup, deployment, and operations."
    >
      <main className={styles.page}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Docs Server</p>
          <h1>job_pull Docs</h1>
          <p className={styles.copy}>
            Setup guides, deployment paths, starter-pack workflows, and operator runbooks for the
            self-hosted job board.
          </p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Open Docs
            </Link>
            <Link className={styles.secondaryAction} to="/docs/getting-started/docker-compose">
              Docker Guide
            </Link>
          </div>
        </section>

        <section className={styles.grid}>
          {cards.map((card) => (
            <Link key={card.title} className={styles.card} to={card.to}>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </Link>
          ))}
        </section>
      </main>
    </Layout>
  );
}
