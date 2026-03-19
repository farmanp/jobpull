import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import styles from "./index.module.css";

const REPO_URL = "https://github.com/farmanp/jobpull";
const DEFAULT_WAITLIST_URL =
  "https://github.com/farmanp/jobpull/issues/new?title=Join%20the%20jobpull%20waitlist&body=Name:%0AEmail:%0AWhat%20kind%20of%20board%20do%20you%20want%20to%20run%3F%0A";

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
    <div className={styles.jobCard}>
      <div className={styles.jobCardHeader}>
        <div className={styles.companyAvatar}></div>
        <div>
          <h4>{company}</h4>
          <span className={styles.jobTag}>{source}</span>
        </div>
      </div>
      <h3 className={styles.jobTitle}>{title}</h3>
      <div className={styles.jobPills}>
        <span>{status}</span>
        <span>{detail}</span>
      </div>
      <div className={styles.jobCardFooter}>
        <span className={styles.jobDetail}>Matched by your rules</span>
        <div className={styles.reviewButton}>Review</div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const waitlistUrl =
    typeof siteConfig.customFields?.waitlistUrl === "string"
      ? siteConfig.customFields.waitlistUrl
      : DEFAULT_WAITLIST_URL;

  return (
    <Layout
      title="jobpull"
      description="Self-hosted job board starter kit for Greenhouse, Lever, Ashby, Recruitee, Personio XML, and JSON feeds."
    >
      <main className={styles.page}>
        <section className={styles.heroSection}>
          <div className={styles.heroContainer}>
            <div className={styles.heroContent}>
              <div className={styles.pillBadge}>Cloudflare-first job board</div>
              <h1 className={styles.heroTitle}>
                Run your own board.
                <br />
                Tune it to your search.
              </h1>
              <p className={styles.heroSubtitle}>
                jobpull is an open-source crawler and dashboard for public job feeds from Greenhouse, Lever, Ashby,
                Recruitee, Personio XML, and generic JSON sources. It ships pre-tuned for remote product roles, with
                starter packs for product, engineering, design, and GTM.
              </p>
              <div className={styles.heroActions}>
                <Link className={`${styles.button} ${styles.buttonPrimary}`} to="/docs/getting-started/cloudflare-quickstart">
                  Setup Guide
                </Link>
                <Link className={`${styles.button} ${styles.buttonAccent}`} href={waitlistUrl} target="_blank" rel="noreferrer">
                  Join Waitlist
                </Link>
                <Link className={`${styles.button} ${styles.buttonOutline}`} to="/docs/guides/customization">
                  Customize
                </Link>
              </div>
              <p className={styles.heroNote}>Cloudflare-first, with a Docker path and daily crawl scheduling.</p>
            </div>

            <div className={styles.heroVisual}>
              <div className={styles.cardStack}>
                <div className={`${styles.cardStackItem} ${styles.cardStackFront}`}>
                  <JobCardMockup
                    title="Senior Product Manager, Core Platform"
                    company="Stripe"
                    source="Greenhouse"
                    status="Remote"
                    detail="platform focus"
                  />
                </div>
                <div className={`${styles.cardStackItem} ${styles.cardStackMiddle}`}>
                  <JobCardMockup
                    title="Director of Product, Growth"
                    company="Netlify"
                    source="Lever"
                    status="Hybrid"
                    detail="growth focus"
                  />
                </div>
                <div className={`${styles.cardStackItem} ${styles.cardStackBack}`}>
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

        <section className={styles.statsSection}>
          <div className={styles.statsGrid}>
            <StatCard value="4" label="Starter packs" />
            <StatCard value="6" label="Read-only feed types" />
            <StatCard value="Daily" label="Scheduled crawl" />
            <StatCard value="100%" label="Open source" />
          </div>
        </section>

        <section className={styles.processSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionKicker}>Simple Process</div>
            <h2 className={styles.processTitle}>How It Works</h2>
            <p className={styles.processSubtitle}>
              Four steps from a niche search idea to a board that stays current without turning into a scraping mess.
            </p>
          </div>

          <div className={styles.processGrid}>
            <article className={styles.processCard}>
              <div className={styles.stepLabel}>Step 1</div>
              <div className={styles.processVisual}>
                <div className={styles.sceneHeader}>
                  <span className={styles.sceneKicker}>Starter pack</span>
                  <span className={styles.sceneStatus}>Loaded</span>
                </div>
                <div className={styles.packPrimary}>
                  <div className={styles.packPrimaryTitle}>Product</div>
                  <div className={styles.packPrimaryCopy}>Remote PM default</div>
                  <div className={styles.sceneChipRow}>
                    <span>growth</span>
                    <span>platform</span>
                    <span>technical</span>
                  </div>
                </div>
                <div className={styles.packSecondary}>
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

            <article className={styles.processCard}>
              <div className={styles.stepLabel}>Step 2</div>
              <div className={styles.processVisual}>
                <div className={styles.sceneHeader}>
                  <span className={styles.sceneKicker}>Read-only feeds</span>
                  <span className={styles.sceneStatus}>4 live</span>
                </div>
                <div className={styles.feedGrid}>
                  <div className={styles.feedItem}>
                    <span className={styles.feedDot}></span>
                    <span>Greenhouse</span>
                  </div>
                  <div className={styles.feedItem}>
                    <span className={styles.feedDot}></span>
                    <span>Lever</span>
                  </div>
                  <div className={styles.feedItem}>
                    <span className={styles.feedDot}></span>
                    <span>Ashby</span>
                  </div>
                  <div className={styles.feedItem}>
                    <span className={styles.feedDot}></span>
                    <span>JSON feed</span>
                  </div>
                </div>
                <div className={styles.feedOutput}>
                  <div className={styles.feedOutputTitle}>Normalized into one board dataset</div>
                  <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                  <div className={styles.sceneLine}></div>
                  <div className={`${styles.sceneLine} ${styles.sceneLineMedium}`}></div>
                </div>
              </div>
              <h3>Connect public feeds</h3>
              <p>
                Add official read-only endpoints instead of brittle HTML scrapers, then layer in your own tenant and
                niche sources.
              </p>
            </article>

            <article className={styles.processCard}>
              <div className={styles.stepLabel}>Step 3</div>
              <div className={styles.processVisual}>
                <div className={styles.sceneHeader}>
                  <span className={styles.sceneKicker}>Crawl run</span>
                  <span className={styles.sceneStatus}>Daily</span>
                </div>
                <div className={styles.workflow}>
                  <div className={styles.workflowStep}>
                    <div className={styles.workflowLabel}>Fetch</div>
                    <div className={styles.workflowCard}>
                      <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                      <div className={styles.sceneLine}></div>
                      <div className={`${styles.sceneLine} ${styles.sceneLineMedium}`}></div>
                    </div>
                  </div>
                  <div className={styles.workflowLink}></div>
                  <div className={styles.workflowStep}>
                    <div className={styles.workflowLabel}>Classify</div>
                    <div className={`${styles.workflowCard} ${styles.workflowCardTags}`}>
                      <span className={styles.workflowTokenInclude}>include</span>
                      <span className={styles.workflowTokenExclude}>exclude</span>
                      <span className={styles.workflowTokenFocus}>platform</span>
                      <span className={styles.workflowTokenFocus}>growth</span>
                    </div>
                  </div>
                  <div className={styles.workflowLink}></div>
                  <div className={styles.workflowStep}>
                    <div className={styles.workflowLabel}>Refresh</div>
                    <div className={`${styles.workflowCard} ${styles.workflowCardStats}`}>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatLive}></span>
                        <span>119 visible</span>
                      </div>
                      <div className={styles.workflowStat}>
                        <span className={styles.workflowStatStale}></span>
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

            <article className={`${styles.processCard} ${styles.processCardHighlight}`}>
              <div className={styles.stepLabel}>Step 4</div>
              <div className={styles.processVisual}>
                <div className={styles.sceneHeader}>
                  <span className={styles.sceneKicker}>Board preview</span>
                  <span className={styles.sceneStatus}>Share ready</span>
                </div>
                <div className={styles.boardPreview}>
                  <div className={styles.boardTopbar}>
                    <div className={styles.boardSearch}></div>
                    <div className={styles.boardFilter}></div>
                  </div>
                  <div className={styles.boardColumns}>
                    <div className={styles.boardResults}>
                      <div className={`${styles.boardResult} ${styles.boardResultActive}`}>
                        <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                        <div className={`${styles.sceneLine} ${styles.sceneLineMedium}`}></div>
                      </div>
                      <div className={styles.boardResult}>
                        <div className={`${styles.sceneLine} ${styles.sceneLineMedium}`}></div>
                        <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                      </div>
                      <div className={styles.boardResult}>
                        <div className={styles.sceneLine}></div>
                        <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                      </div>
                    </div>
                    <div className={styles.boardDetail}>
                      <div className={styles.boardPill}>Today&apos;s digest</div>
                      <div className={`${styles.sceneLine} ${styles.sceneLineShort}`}></div>
                      <div className={styles.sceneLine}></div>
                      <div className={`${styles.sceneLine} ${styles.sceneLineMedium}`}></div>
                      <div className={styles.boardShare}>Share board</div>
                    </div>
                  </div>
                </div>
              </div>
              <h3>Review and share</h3>
              <p>
                The searchable board, digest, and admin tools all sit on the same dataset, so the board you publish is
                the board you actually operate.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.featureSection}>
          <div className={styles.featureGrid}>
            <div>
              <div className={styles.sectionKicker}>Platform</div>
              <h2 className={styles.sectionTitle}>A board built around explicit rules.</h2>
              <p className={styles.sectionSubtitle}>
                Stop relying on ranking algorithms you do not control. jobpull keeps the crawl and the UI small enough
                that you can actually decide which roles make it onto the board.
              </p>
              <ul className={styles.featureList}>
                <li>
                  <strong>Rule-based targeting</strong>
                  <p>Match titles with include and exclude patterns, optional description fallback, and remote-only filtering.</p>
                </li>
                <li>
                  <strong>Searchable dashboard</strong>
                  <p>Review jobs by query, remote status, focus area, and sort order from the same board your crawler populates.</p>
                </li>
                <li>
                  <strong>Rebrandable defaults</strong>
                  <p>Change the board name, tagline, starter pack, seed sources, focus categories, and theme without rewriting the app.</p>
                </li>
              </ul>
            </div>

            <div className={styles.window}>
              <div className={styles.windowHeader}>
                <div className={styles.windowDots}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div className={styles.windowTab}>Settings Panel</div>
              </div>
              <div className={styles.windowBody}>
                <div className={styles.windowRow}>
                  <strong>Board:</strong> <span>jobpull</span>
                </div>
                <div className={styles.windowRow}>
                  <strong>Includes:</strong> <span>Product Manager</span> <span>Director of Product</span>
                </div>
                <div className={styles.windowRow}>
                  <strong>Excludes:</strong> <span>Project Manager</span> <span>Product Marketing</span>
                </div>
                <div className={styles.windowRow}>
                  <strong>Focus:</strong> <span>growth</span> <span>platform</span> <span>technical</span>
                </div>
                <hr className={styles.windowDivider} />
                <div className={styles.toggleRow}>
                  Remote only: <strong>Enabled</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.automationSection}>
          <div className={styles.automationHeader}>
            <div className={styles.sectionKicker}>Automation</div>
            <h2 className={styles.sectionTitle}>Scheduled crawling without a hosted platform.</h2>
            <p className={styles.sectionSubtitle}>
              The worker ships with a daily Cloudflare cron, an authenticated run endpoint for manual refreshes, and
              D1-backed configuration shared by the crawler, CLI, and admin UI. The Docker path keeps the same
              workflow with SQLite.
            </p>
          </div>
          <div className={styles.automationGrid}>
            <div className={styles.automationCard}>
              <h3>Daily crawl</h3>
              <p>Run once per day by default, then change the cron when your board needs a different cadence.</p>
            </div>
            <div className={styles.automationCard}>
              <h3>Manual reruns</h3>
              <p>Trigger a crawl from the admin tools or hit the protected API when you want a fresh pass immediately.</p>
            </div>
            <div className={styles.automationCard}>
              <h3>Shared config</h3>
              <p>Board rules live in D1, so configuration changes made through the UI or CLI feed the same runtime state.</p>
            </div>
            <div className={styles.automationCard}>
              <h3>Safety controls</h3>
              <p>ETags, retries, host spacing, and backoff keep the crawler practical without pretending to be a scraping farm.</p>
            </div>
          </div>
        </section>

        <section className={styles.waitlistSection}>
          <div className={styles.waitlistGrid}>
            <div className={styles.waitlistCopy}>
              <div className={styles.sectionKicker}>Waitlist</div>
              <h2 className={styles.sectionTitle}>Get launch updates while jobpull is still early.</h2>
              <p className={styles.sectionSubtitle}>
                If you want to run a niche board for your community, team, or newsletter, join the waitlist and tell
                us what you are trying to launch. That input is the fastest way to shape the next deployment guides,
                feed templates, and onboarding flow.
              </p>
              <ul className={styles.waitlistPoints}>
                <li>See new starter packs and source templates before they land in the polished quick-start flow.</li>
                <li>Get notified when the hosted signup path replaces the temporary early-access form.</li>
                <li>Tell us which deployment path, role niche, or feed support would actually make this useful.</li>
              </ul>
            </div>

            <div className={styles.waitlistCard}>
              <div className={styles.waitlistCardKicker}>Early Access</div>
              <h3>Join the jobpull waitlist</h3>
              <p>
                Open the current signup flow, share your email and use case, and we will use that feedback to tighten
                the launch path.
              </p>
              <Link className={`${styles.button} ${styles.buttonAccent}`} href={waitlistUrl} target="_blank" rel="noreferrer">
                Join Waitlist
              </Link>
              <span className={styles.waitlistCaption}>Opens the current signup form in a new tab.</span>
            </div>
          </div>
        </section>

        <section className={styles.ctaSection}>
          <div className={styles.ctaContainer}>
            <h2>Launch a board that matches your search.</h2>
            <p>Fork the repo, pick a starter pack, and deploy the board on Cloudflare or Docker.</p>
            <div className={styles.ctaActions}>
              <Link className={`${styles.button} ${styles.buttonPrimary}`} to="/docs/getting-started/cloudflare-quickstart">
                Open Setup Guide
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineInverse}`} to="/docs/intro">
                Browse Docs
              </Link>
              <Link className={`${styles.button} ${styles.buttonOutlineInverse}`} href={REPO_URL}>
                GitHub
              </Link>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
