import "./styles.css";

const REPO_URL = "https://github.com/farmanp/job_pull";
const DOCS_URL = `${REPO_URL}#readme`;
const CUSTOMIZING_URL = `${REPO_URL}/blob/main/CUSTOMIZING.md`;

function JobCardMockup({
  title,
  company,
  source,
  status,
  detail,
}: {
  title: string;
  company: string;
  source: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="job-card-mockup">
      <div className="jcm-header">
        <div className="jcm-company-avatar"></div>
        <div className="jcm-meta">
          <h4>{company}</h4>
          <span className="jcm-tag">{source}</span>
        </div>
      </div>
      <h3 className="jcm-title">{title}</h3>
      <div className="jcm-pills">
        <span>{status}</span>
        <span>{detail}</span>
      </div>
      <div className="jcm-footer">
        <span className="jcm-detail">Matched by your rules</span>
        <div className="jcm-apply-btn">Review</div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function App() {
  return (
    <div className="page-wrapper">
      <nav className="navbar">
        <div className="nav-container">
          <div className="brand">
            job_<span>pull</span>
          </div>
          <div className="nav-links">
            <a href="#platform">Platform</a>
            <a href="#automation">Automation</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Open Source
            </a>
          </div>
          <div className="nav-actions">
            <a href={DOCS_URL} className="button button-outline" target="_blank" rel="noreferrer">
              Read Docs
            </a>
            <a href={CUSTOMIZING_URL} className="button button-solid" target="_blank" rel="noreferrer">
              Customize
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-container">
            <div className="hero-content">
              <div className="pill-badge">Cloudflare-native job board</div>
              <h1 className="hero-title">
                Run your own board.
                <br />
                Tune it to your search.
              </h1>
              <p className="hero-subtitle">
                job_pull is an open-source crawler and dashboard for Greenhouse, Lever, and JSON job feeds like
                RemoteOK, Remotive, Arbeitnow, and Working Nomads. It ships pre-tuned for remote product roles, but
                the rules are yours to change.
              </p>

              <div className="hero-cta-group">
                <div className="hero-cta-row">
                  <a href="#platform" className="button button-primary button-large">
                    Explore the Platform
                  </a>
                  <a href="#automation" className="button button-outline button-large">
                    See Automation
                  </a>
                </div>
                <span className="hero-note">Workers + D1 + Pages. Daily cron included.</span>
              </div>
            </div>

            <div className="hero-visual">
              <div className="card-stack">
                <div className="card-stack-item card-stack-item-1">
                  <JobCardMockup
                    title="Senior Product Manager, Core Platform"
                    company="Stripe"
                    source="Greenhouse"
                    status="Remote"
                    detail="platform focus"
                  />
                </div>
                <div className="card-stack-item card-stack-item-2">
                  <JobCardMockup
                    title="Director of Product, Growth"
                    company="Netlify"
                    source="Lever"
                    status="Hybrid"
                    detail="growth focus"
                  />
                </div>
                <div className="card-stack-item card-stack-item-3">
                  <JobCardMockup
                    title="Head of Product"
                    company="Remote Startup"
                    source="Remote JSON"
                    status="Remote"
                    detail="custom feed"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="data-bar">
          <div className="data-bar-container">
            <StatCard value="5" label="Default source templates" />
            <StatCard value="3" label="Fetcher types included" />
            <StatCard value="Daily" label="Cloudflare cron" />
            <StatCard value="100%" label="Open source" />
          </div>
        </section>

        <section id="platform" className="feature-section section-bg-light">
          <div className="feature-container">
            <div className="feature-text">
              <div className="section-kicker">Platform</div>
              <h2 className="section-title">A board built around explicit rules.</h2>
              <p className="section-subtitle">
                Stop relying on ranking algorithms you do not control. job_pull keeps the crawl and the UI small enough
                that you can actually decide which roles make it onto the board.
              </p>

              <ul className="feature-list">
                <li>
                  <strong>Rule-based targeting</strong>
                  <p>
                    Match titles with include and exclude patterns, optional description fallback, and remote-only
                    filtering.
                  </p>
                </li>
                <li>
                  <strong>Searchable dashboard</strong>
                  <p>Review jobs by query, remote status, focus area, and sort order from the same board your crawler populates.</p>
                </li>
                <li>
                  <strong>Rebrandable defaults</strong>
                  <p>Change the board name, tagline, seed sources, focus categories, and theme without rewriting the app.</p>
                </li>
              </ul>
            </div>
            <div className="feature-image">
              <div className="ui-window">
                <div className="ui-header">
                  <div className="ui-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="ui-tab">Settings Panel</div>
                </div>
                <div className="ui-body">
                  <div className="ui-row">
                    <strong>Board:</strong> <span>job_pull</span>
                  </div>
                  <div className="ui-row">
                    <strong>Includes:</strong> <span>Product Manager</span>, <span>Director of Product</span>
                  </div>
                  <div className="ui-row">
                    <strong>Excludes:</strong> <span>Project Manager</span>, <span>Product Marketing</span>
                  </div>
                  <div className="ui-row">
                    <strong>Focus:</strong> <span>growth</span>, <span>platform</span>, <span>technical</span>
                  </div>
                  <hr className="ui-divider" />
                  <div className="ui-toggle active">
                    Remote only: <strong>Enabled</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="automation" className="feature-section">
          <div className="feature-container automation-layout">
            <div className="feature-text">
              <div className="section-kicker">Automation</div>
              <h2 className="section-title">Scheduled crawling without a hosted platform.</h2>
              <p className="section-subtitle">
                The worker ships with a daily Cloudflare cron, an authenticated run endpoint for manual refreshes, and
                D1-backed configuration shared by the crawler, CLI, and admin UI.
              </p>
            </div>
            <div className="automation-grid">
              <div className="automation-card">
                <h3>Daily crawl</h3>
                <p>Run once per day by default, then change the cron when your board needs a different cadence.</p>
              </div>
              <div className="automation-card">
                <h3>Manual reruns</h3>
                <p>Trigger a crawl from the admin tools or hit the protected API when you want a fresh pass immediately.</p>
              </div>
              <div className="automation-card">
                <h3>Shared config</h3>
                <p>Board rules live in D1, so configuration changes made through the UI or CLI feed the same runtime state.</p>
              </div>
              <div className="automation-card">
                <h3>Safety controls</h3>
                <p>ETags, retries, host spacing, and backoff keep the crawler practical without pretending to be a scraping farm.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bottom-cta">
          <div className="cta-container">
            <h2>Launch a board that matches your search.</h2>
            <p>Fork the repo, tweak the filters, and deploy the worker plus frontend on your own Cloudflare account.</p>
            <a href={DOCS_URL} className="button button-solid button-large" target="_blank" rel="noreferrer">
              Open Setup Guide
            </a>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">job_pull</div>
          <div className="footer-links">
            <span>Open Source Software</span>
            <a href={CUSTOMIZING_URL} target="_blank" rel="noreferrer">
              Customization Guide
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub Repository
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
