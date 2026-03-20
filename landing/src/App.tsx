import "./styles.css";

const REPO_URL = "https://github.com/farmanp/jobpull";
const DOCS_URL = "https://farmanp.github.io/jobpull/";
const SETUP_URL = "https://farmanp.github.io/jobpull/docs/getting-started/cloudflare-quickstart";
const CUSTOMIZE_URL = "https://farmanp.github.io/jobpull/docs/guides/customization";
const DEFAULT_WAITLIST_URL =
  "https://github.com/farmanp/jobpull/issues/new?title=Join%20the%20jobpull%20waitlist&body=Name:%0AEmail:%0AWhat%20kind%20of%20board%20do%20you%20want%20to%20run%3F%0A";
const WAITLIST_URL = import.meta.env.VITE_WAITLIST_URL ?? DEFAULT_WAITLIST_URL;

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
            job<span>pull</span>
          </div>
          <div className="nav-links">
            <a href="#how-it-works">How It Works</a>
            <a href="#platform">Platform</a>
            <a href="#automation">Automation</a>
            <a href="#waitlist">Waitlist</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Open Source
            </a>
          </div>
          <div className="nav-actions">
            <a href={DOCS_URL} className="button button-outline" target="_blank" rel="noreferrer">
              Read Docs
            </a>
            <a href={CUSTOMIZE_URL} className="button button-solid" target="_blank" rel="noreferrer">
              Customize
            </a>
          </div>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-container">
            <div className="hero-content">
              <div className="pill-badge">Personal board first</div>
              <h1 className="hero-title">
                Run your own personal board.
                <br />
                Publish it when you're ready.
              </h1>
              <p className="hero-subtitle">
                jobpull is an open-source personal job board for public feeds from Greenhouse, Lever, Ashby,
                Recruitee, Personio XML, and generic JSON sources. Claim it once, keep it private while you track your
                own search, then publish it later if you want to turn it into a niche board.
              </p>

              <div className="hero-cta-group">
                <div className="hero-cta-row">
                  <a href="#how-it-works" className="button button-primary button-large">
                    See How It Works
                  </a>
                  <a href="#waitlist" className="button button-solid button-large">
                    Join Waitlist
                  </a>
                  <a href={SETUP_URL} className="button button-outline button-large" target="_blank" rel="noreferrer">
                    Setup Guide
                  </a>
                </div>
                <span className="hero-note">Cloudflare-first, with a Docker path, owner magic links, and private-by-default visibility.</span>
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
            <StatCard value="4" label="Starter packs" />
            <StatCard value="6" label="Read-only feed types" />
            <StatCard value="Daily" label="Scheduled crawl" />
            <StatCard value="100%" label="Open source" />
          </div>
        </section>

        <section id="how-it-works" className="process-section">
          <div className="process-container">
            <div className="process-header">
              <div className="section-kicker">Simple Process</div>
              <h2 className="process-title">How It Works</h2>
              <p className="process-subtitle">
                Four steps from a niche search idea to a board that stays current without turning into a scraping mess.
              </p>
            </div>

            <div className="process-grid">
              <article className="process-card">
                <div className="process-step-label">Step 1</div>
                <div className="process-visual process-scene">
                  <div className="process-scene-header">
                    <span className="process-scene-kicker">Starter pack</span>
                    <span className="process-scene-status">Loaded</span>
                  </div>
                  <div className="process-pack-primary">
                    <div className="process-pack-primary-title">Product</div>
                    <div className="process-pack-primary-copy">Remote PM default</div>
                    <div className="process-scene-chip-row">
                      <span>growth</span>
                      <span>platform</span>
                      <span>technical</span>
                    </div>
                  </div>
                  <div className="process-pack-secondary">
                    <span>Engineering</span>
                    <span>Design</span>
                    <span>GTM</span>
                  </div>
                </div>
                <h3>Pick a starter pack</h3>
                <p>
                  Start with a role preset that already ships with targeting rules, focus tags, and a sane first-pass
                  source bundle.
                </p>
              </article>

              <article className="process-card">
                <div className="process-step-label">Step 2</div>
                <div className="process-visual process-scene">
                  <div className="process-scene-header">
                    <span className="process-scene-kicker">Read-only feeds</span>
                    <span className="process-scene-status">4 live</span>
                  </div>
                  <div className="process-feed-grid">
                    <div className="process-feed-item">
                      <span className="process-feed-dot"></span>
                      <span>Greenhouse</span>
                    </div>
                    <div className="process-feed-item">
                      <span className="process-feed-dot"></span>
                      <span>Lever</span>
                    </div>
                    <div className="process-feed-item">
                      <span className="process-feed-dot"></span>
                      <span>Ashby</span>
                    </div>
                    <div className="process-feed-item">
                      <span className="process-feed-dot"></span>
                      <span>JSON feed</span>
                    </div>
                  </div>
                  <div className="process-feed-output">
                    <div className="process-feed-output-title">Normalized into one board dataset</div>
                    <div className="process-scene-line short"></div>
                    <div className="process-scene-line"></div>
                    <div className="process-scene-line medium"></div>
                  </div>
                </div>
                <h3>Connect public feeds</h3>
                <p>
                  Add official read-only endpoints instead of brittle HTML scrapers, then layer in your own tenant and
                  niche sources.
                </p>
              </article>

              <article className="process-card">
                <div className="process-step-label">Step 3</div>
                <div className="process-visual process-scene">
                  <div className="process-scene-header">
                    <span className="process-scene-kicker">Crawl run</span>
                    <span className="process-scene-status">Daily</span>
                  </div>
                  <div className="process-workflow">
                    <div className="process-workflow-step">
                      <div className="process-workflow-label">Fetch</div>
                      <div className="process-workflow-card">
                        <div className="process-scene-line short"></div>
                        <div className="process-scene-line"></div>
                        <div className="process-scene-line medium"></div>
                      </div>
                    </div>
                    <div className="process-workflow-link"></div>
                    <div className="process-workflow-step">
                      <div className="process-workflow-label">Classify</div>
                      <div className="process-workflow-card process-workflow-card-tags">
                        <span className="include">include</span>
                        <span className="exclude">exclude</span>
                        <span className="focus">platform</span>
                        <span className="focus">growth</span>
                      </div>
                    </div>
                    <div className="process-workflow-link"></div>
                    <div className="process-workflow-step">
                      <div className="process-workflow-label">Refresh</div>
                      <div className="process-workflow-card process-workflow-card-stats">
                        <div className="process-workflow-stat">
                          <span className="live"></span>
                          <span>119 visible</span>
                        </div>
                        <div className="process-workflow-stat">
                          <span className="stale"></span>
                          <span>6 stale hidden</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <h3>Run and classify</h3>
                <p>
                  The worker fetches feeds, applies your include and exclude rules, dedupes jobs, and quietly hides
                  stale listings on recrawl.
                </p>
              </article>

              <article className="process-card process-card-highlight">
                <div className="process-step-label">Step 4</div>
                <div className="process-visual process-scene">
                  <div className="process-scene-header">
                    <span className="process-scene-kicker">Board preview</span>
                    <span className="process-scene-status">Share ready</span>
                  </div>
                  <div className="process-board-preview">
                    <div className="process-board-topbar">
                      <div className="process-board-search"></div>
                      <div className="process-board-filter"></div>
                    </div>
                    <div className="process-board-columns">
                      <div className="process-board-results">
                        <div className="process-board-result active">
                          <div className="process-scene-line short"></div>
                          <div className="process-scene-line medium"></div>
                        </div>
                        <div className="process-board-result">
                          <div className="process-scene-line medium"></div>
                          <div className="process-scene-line short"></div>
                        </div>
                        <div className="process-board-result">
                          <div className="process-scene-line"></div>
                          <div className="process-scene-line short"></div>
                        </div>
                      </div>
                      <div className="process-board-detail">
                        <div className="process-board-pill">Today&apos;s digest</div>
                        <div className="process-scene-line short"></div>
                        <div className="process-scene-line"></div>
                        <div className="process-scene-line medium"></div>
                        <div className="process-board-share">Share board</div>
                      </div>
                    </div>
                  </div>
                </div>
                <h3>Review and share</h3>
                <p>
                  The searchable board, digest, and admin tools all sit on the same dataset, so the board you publish
                  is the board you actually operate.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="platform" className="feature-section section-bg-light">
          <div className="feature-container">
            <div className="feature-text">
              <div className="section-kicker">Platform</div>
              <h2 className="section-title">A board built around explicit rules.</h2>
              <p className="section-subtitle">
                Stop relying on ranking algorithms you do not control. jobpull keeps the crawl and the UI small enough
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
                  <p>
                    Change the board name, tagline, starter pack, seed sources, focus categories, and theme without
                    rewriting the app.
                  </p>
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
                    <strong>Board:</strong> <span>jobpull</span>
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
                D1-backed configuration shared by the crawler, CLI, and admin UI. The Docker path keeps the same
                workflow with SQLite.
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

        <section id="waitlist" className="waitlist-section section-bg-light">
          <div className="waitlist-container">
            <div className="waitlist-copy">
              <div className="section-kicker">Waitlist</div>
              <h2 className="section-title">Get launch updates while jobpull is still early.</h2>
              <p className="section-subtitle">
                If you want to run a niche board for your community, team, or newsletter, join the waitlist and tell
                us what you are trying to launch. That input is the fastest way to shape the next deployment guides,
                feed templates, and onboarding flow.
              </p>
              <ul className="waitlist-points">
                <li>See new starter packs and source templates before they land in the polished quick-start flow.</li>
                <li>Get notified when the hosted signup path replaces the temporary early-access form.</li>
                <li>Tell us which deployment path, role niche, or feed support would actually make this useful.</li>
              </ul>
            </div>

            <div className="waitlist-card">
              <div className="waitlist-card-kicker">Early Access</div>
              <h3>Join the jobpull waitlist</h3>
              <p>
                Open the current signup flow, share your email and use case, and we will use that feedback to tighten
                the launch path.
              </p>
              <a href={WAITLIST_URL} className="button button-solid button-large" target="_blank" rel="noreferrer">
                Join Waitlist
              </a>
              <span className="waitlist-caption">Opens the current signup form in a new tab.</span>
            </div>
          </div>
        </section>

        <section className="bottom-cta">
          <div className="cta-container">
            <h2>Launch a board that matches your search.</h2>
            <p>Fork the repo, pick a starter pack, and deploy the board on Cloudflare or Docker.</p>
            <div className="cta-actions">
              <a href={SETUP_URL} className="button button-solid button-large" target="_blank" rel="noreferrer">
                Open Setup Guide
              </a>
              <a href={DOCS_URL} className="button button-outline button-large" target="_blank" rel="noreferrer">
                Browse Docs
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">jobpull</div>
          <div className="footer-links">
            <span>Open Source Software</span>
            <a href={CUSTOMIZE_URL} target="_blank" rel="noreferrer">
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
