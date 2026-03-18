import { useEffect, useMemo, useState } from "react";
import { SettingsPanel } from "./SettingsPanel";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_status: string;
  url: string;
  date_posted?: string;
  date_seen: string;
  description?: string;
  pm_focus: string;
  tags: string[];
  is_stale?: number;
};

type BoardMeta = {
  boardName: string;
  tagline: string;
  remoteOnly: boolean;
  focusCategories: string[];
};

type BoardStats = {
  totalJobs: number;
  visibleJobs: number;
  staleJobs: number;
  activeSources: number;
  staleThresholdDays: number;
  lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const SETTINGS_AVAILABLE = true; // Set via env or feature flag

async function api<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status}`);
  }

  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("API response was not JSON. Check VITE_API_BASE / deployment API config.");
  }

  return (await resp.json()) as T;
}

function isBoardMeta(value: unknown): value is BoardMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.boardName === "string" &&
    typeof record.tagline === "string" &&
    typeof record.remoteOnly === "boolean" &&
    Array.isArray(record.focusCategories)
  );
}

function isBoardStats(value: unknown): value is BoardStats {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.totalJobs === "number" &&
    typeof record.visibleJobs === "number" &&
    typeof record.staleJobs === "number" &&
    typeof record.activeSources === "number" &&
    typeof record.staleThresholdDays === "number"
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function App() {
  const [page, setPage] = useState<"jobs" | "digest" | "settings">("jobs");
  const [query, setQuery] = useState("");
  const [remoteStatus, setRemoteStatus] = useState("");
  const [pmFocus, setPmFocus] = useState("");
  const [sort, setSort] = useState("newest_seen");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [digest, setDigest] = useState<Record<string, Job[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasSelectedJob = Boolean(selectedJob);

  // Board metadata from API (or env var fallbacks)
  const [meta, setMeta] = useState<BoardMeta>({
    boardName: import.meta.env.VITE_BOARD_NAME ?? "Job Board",
    tagline: import.meta.env.VITE_TAGLINE ?? "",
    remoteOnly: true,
    focusCategories: [],
  });
  const [stats, setStats] = useState<BoardStats | null>(null);

  // Fetch board meta + stats on mount
  useEffect(() => {
    api<BoardMeta>("/api/meta")
      .then((data) => {
        if (isBoardMeta(data)) {
          setMeta(data);
        }
      })
      .catch(() => { /* use env var fallbacks */ });
    api<BoardStats>("/api/stats")
      .then((data) => {
        if (isBoardStats(data)) {
          setStats(data);
        }
      })
      .catch(() => { /* non-critical */ });
  }, []);

  const jobsPath = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("query", query);
    if (remoteStatus) p.set("remote_status", remoteStatus);
    if (pmFocus) p.set("pm_focus", pmFocus);
    if (sort) p.set("sort", sort);
    p.set("limit", "50");
    return `/api/jobs?${p.toString()}`;
  }, [query, remoteStatus, pmFocus, sort]);

  useEffect(() => {
    if (page !== "jobs") return;
    setLoading(true);
    setError("");
    api<{ items: Job[] }>(jobsPath)
      .then((data) => {
        setJobs(data.items);
        if (selectedJob) {
          const found = data.items.find((j) => j.id === selectedJob.id);
          if (found) {
            setSelectedJob({ ...found, description: selectedJob.description, tags: selectedJob.tags });
          } else {
            setSelectedJob(null);
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [jobsPath, page]);

  useEffect(() => {
    if (page !== "digest") return;
    setLoading(true);
    setError("");
    api<{ groups: Record<string, Job[]> }>("/api/digest/today")
      .then((data) => setDigest(data.groups))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <main className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>{meta.boardName}</h1>
          {meta.tagline && <p className="tagline">{meta.tagline}</p>}
        </div>
        <div className="tabs">
          <button id="tab-jobs" className={page === "jobs" ? "active" : ""} onClick={() => setPage("jobs")}>Jobs</button>
          <button id="tab-digest" className={page === "digest" ? "active" : ""} onClick={() => setPage("digest")}>Today&apos;s Digest</button>
          {SETTINGS_AVAILABLE && (
            <button id="tab-settings" className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>⚙️</button>
          )}
        </div>
      </header>

      {stats && (
        <div className="stats-bar" aria-label="Board statistics">
          <span>{stats.visibleJobs.toLocaleString()} visible jobs</span>
          <span className="stats-sep">·</span>
          <span>{stats.activeSources} source{stats.activeSources !== 1 ? "s" : ""}</span>
          {stats.staleJobs > 0 && (
            <>
              <span className="stats-sep">·</span>
              <span>{stats.staleJobs} stale hidden</span>
            </>
          )}
          {stats.lastCrawl && (
            <>
              <span className="stats-sep">·</span>
              <span>Last crawled {timeAgo(stats.lastCrawl.finishedAt)}</span>
              <span className="stats-sep">·</span>
              <span className={`crawl-status crawl-${stats.lastCrawl.status}`}>
                {stats.lastCrawl.status}
              </span>
            </>
          )}
        </div>
      )}

      {page === "jobs" && (
        <>
          <section className="filters">
            <input
              id="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or company…"
            />
            <select id="filter-remote" value={remoteStatus} onChange={(e) => setRemoteStatus(e.target.value)}>
              <option value="">All remote statuses</option>
              <option value="remote">Remote</option>
              <option value="unknown">Unknown</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
            <select id="filter-focus" value={pmFocus} onChange={(e) => setPmFocus(e.target.value)}>
              <option value="">All focus areas</option>
              {meta.focusCategories.length > 0
                ? meta.focusCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))
                : (
                  <>
                    <option value="growth">Growth</option>
                    <option value="platform">Platform</option>
                    <option value="technical">Technical</option>
                    <option value="core">Core</option>
                    <option value="unknown">Unknown</option>
                  </>
                )
              }
            </select>
            <select id="filter-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="newest_seen">Newest seen</option>
              <option value="newest_posted">Newest posted</option>
            </select>
          </section>

          {error && <p className="error">{error}</p>}
          {loading ? <p className="loading-text">Loading…</p> : null}

          <section className={`board ${hasSelectedJob ? "has-selected" : ""}`}>
            <div className="list">
              {jobs.length === 0 && !loading && (
                <div className="empty-state">
                  <p className="empty-icon">🔍</p>
                  <p>No jobs found matching your filters.</p>
                  <p className="empty-hint">Try broadening your search or check back later.</p>
                </div>
              )}
              {jobs.map((job) => (
                <button
                  key={job.id}
                  className={`job ${selectedJob?.id === job.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedJob(job);
                    
                    // Lazy load full details (description) on click
                    api<Job>(`/api/jobs/${encodeURIComponent(job.id)}`)
                      .then((fullJob) => {
                        setSelectedJob((curr) => (curr?.id === fullJob.id ? fullJob : curr));
                      })
                      .catch(console.error);

                    if (window.matchMedia("(max-width: 900px)").matches) {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                >
                  <strong>{job.title}</strong>
                  <span className="job-company">{job.company}</span>
                  <span className="job-location">{job.location}</span>
                  <div className="job-badges">
                    <span className="badge badge-focus">{job.pm_focus}</span>
                    <span className="badge badge-remote">{job.remote_status}</span>
                    {job.date_posted && (
                      <span className="badge badge-date">{timeAgo(job.date_posted)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <aside className="detail">
              {!selectedJob ? (
                <div className="empty-state">
                  <p className="empty-icon">👈</p>
                  <p>Select a job to see details.</p>
                </div>
              ) : (
                <>
                  <button className="mobile-back" onClick={() => setSelectedJob(null)}>
                    ← Back to jobs
                  </button>
                  <h2>{selectedJob.title}</h2>
                  <p className="detail-company">{selectedJob.company}</p>
                  <p className="detail-location">{selectedJob.location}</p>
                  <div className="detail-meta">
                    <span className="badge badge-focus">{selectedJob.pm_focus}</span>
                    <span className="badge badge-remote">{selectedJob.remote_status}</span>
                    {selectedJob.tags?.map((tag) => (
                      <span key={tag} className="badge badge-tag">{tag}</span>
                    ))}
                  </div>
                  {selectedJob.description ? (
                    <p className="description">{selectedJob.description}</p>
                  ) : (
                    <p className="description">No description available.</p>
                  )}
                  <a className="apply-btn" href={selectedJob.url} target="_blank" rel="noreferrer">
                    View Job Posting →
                  </a>
                </>
              )}
            </aside>
          </section>
        </>
      )}

      {page === "digest" && (
        <section>
          {error && <p className="error">{error}</p>}
          {loading ? <p className="loading-text">Loading digest…</p> : null}
          {Object.keys(digest).length === 0 && !loading && (
            <div className="empty-state">
              <p className="empty-icon">📭</p>
              <p>No new jobs in today&apos;s digest yet.</p>
              <p className="empty-hint">Check back after the next crawl.</p>
            </div>
          )}
          {Object.entries(digest).map(([focus, items]) => (
            <div key={focus} className="digest-group">
              <h3>{focus.charAt(0).toUpperCase() + focus.slice(1)}</h3>
              {items.map((job) => (
                <a key={job.id} href={job.url} target="_blank" rel="noreferrer" className="digest-item">
                  <strong>{job.title}</strong>
                  <span className="digest-meta">
                    {job.company} — {job.location}
                  </span>
                  <span className="badge badge-remote">{job.remote_status}</span>
                </a>
              ))}
            </div>
          ))}
        </section>
      )}

      {page === "settings" && (
        <SettingsPanel apiBase={API_BASE} />
      )}

      <footer className="site-footer">
        <p>
          Powered by <a href="https://github.com/farmanp/job_pull" target="_blank" rel="noreferrer">job_pull</a>
          {" · "}Free &amp; open source
        </p>
      </footer>
    </main>
  );
}
