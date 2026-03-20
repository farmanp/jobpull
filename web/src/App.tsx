import { useEffect, useMemo, useState, type FormEvent } from "react";
import { SettingsPanel } from "./SettingsPanel";

type TrackerStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "archived";
type AppPage = "jobs" | "digest" | "myJobs" | "profile" | "settings";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_status: string;
  url: string;
  source?: string;
  date_posted?: string;
  date_seen: string;
  description?: string;
  pm_focus: string;
  tags: string[];
  is_stale?: number;
};

type TrackedJob = Job & {
  favorite: boolean;
  status: TrackerStatus | null;
  notes: string;
  applied_at?: string | null;
  rejected_at?: string | null;
  updated_at?: string | null;
};

type BoardMeta = {
  boardName: string;
  tagline: string;
  remoteOnly: boolean;
  focusCategories: string[];
  claimed: boolean;
  visibility: "private" | "public";
  viewerCanBrowse: boolean;
  viewerIsOwner: boolean;
  auth?: {
    claimRequired: boolean;
    magicLinkDelivery: "resend" | "console" | "disabled";
  };
};

type BoardStats = {
  totalJobs: number;
  visibleJobs: number;
  staleJobs: number;
  activeSources: number;
  staleThresholdDays: number;
  lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
};

type Viewer = {
  authenticated: boolean;
  isOwner: boolean;
  email: string | null;
  boardClaimed: boolean;
  boardVisibility: "private" | "public";
  hasResume: boolean;
};

type OwnerMePayload = {
  user: {
    id: string;
    email: string;
    status: string;
    lastSeenAt: string | null;
  };
  boardState: {
    owner_user_id: string | null;
    visibility: "private" | "public";
    claimed_at: string | null;
    published_at: string | null;
  };
  profile?: Record<string, unknown>;
  resume?: Record<string, unknown> | null;
};

type OwnerLinkResponse = {
  message: string;
  signInUrl?: string;
};

type ResumeInfo = {
  filename: string;
  uploadedAt: string;
  sizeBytes?: number | null;
} | null;

type UserProfile = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  portfolio_url: string;
  resume_text: string;
  resume: ResumeInfo;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TRACKER_STATUSES: TrackerStatus[] = ["saved", "applied", "interviewing", "offer", "rejected", "archived"];

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function createEmptyProfile(email = ""): UserProfile {
  return {
    full_name: "",
    email,
    phone: "",
    location: "",
    linkedin_url: "",
    portfolio_url: "",
    resume_text: "",
    resume: null
  };
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string; details?: string[] };
    if (payload.details?.length) {
      return `${payload.error ?? "Request failed"}: ${payload.details.join(", ")}`;
    }
    return payload.error ?? `Request failed: ${response.status}`;
  }

  const text = await response.text();
  return text || `Request failed: ${response.status}`;
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readApiError(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("API response was not JSON. Check VITE_API_BASE / deployment API config.");
  }

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "PUT",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function deleteJson<T>(path: string): Promise<T> {
  return fetchJson<T>(path, {
    method: "DELETE"
  });
}

async function uploadForm<T>(path: string, formData: FormData): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    body: formData
  });
}

function normalizeBoardMeta(value: unknown): BoardMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.boardName !== "string" ||
    typeof record.tagline !== "string" ||
    typeof record.remoteOnly !== "boolean" ||
    !Array.isArray(record.focusCategories)
  ) {
    return null;
  }

  const visibility = record.visibility === "private" ? "private" : "public";
  const claimed = typeof record.claimed === "boolean" ? record.claimed : true;
  const viewerIsOwner = record.viewerIsOwner === true;
  const viewerCanBrowse = typeof record.viewerCanBrowse === "boolean"
    ? record.viewerCanBrowse
    : visibility === "public" || viewerIsOwner;

  return {
    boardName: record.boardName,
    tagline: record.tagline,
    remoteOnly: record.remoteOnly,
    focusCategories: record.focusCategories as string[],
    claimed,
    visibility,
    viewerCanBrowse,
    viewerIsOwner,
    auth: record.auth && typeof record.auth === "object"
      ? {
          claimRequired: (record.auth as Record<string, unknown>).claimRequired !== false,
          magicLinkDelivery: (() => {
            const value = (record.auth as Record<string, unknown>).magicLinkDelivery;
            return value === "console" || value === "disabled" ? value : "resend";
          })()
        }
      : undefined
  };
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

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function formatTrackerStatus(status: TrackerStatus | null): string {
  if (!status) {
    return "Not tracked";
  }
  return titleCase(status);
}

function normalizeViewer(value: unknown): Viewer {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const user = record.user && typeof record.user === "object" ? record.user as Record<string, unknown> : null;
  const boardState = record.boardState && typeof record.boardState === "object"
    ? record.boardState as Record<string, unknown>
    : null;
  return {
    authenticated: record.authenticated === true || Boolean(user),
    isOwner: record.isOwner === true || Boolean(user),
    email: typeof record.email === "string" ? record.email : typeof user?.email === "string" ? user.email : null,
    boardClaimed: record.boardClaimed === true || Boolean(boardState?.owner_user_id),
    boardVisibility: record.boardVisibility === "public" || boardState?.visibility === "public" ? "public" : "private",
    hasResume: record.hasResume === true || Boolean(record.resume)
  };
}

function normalizeProfile(value: unknown, email = ""): UserProfile {
  if (!value || typeof value !== "object") {
    return createEmptyProfile(email);
  }

  const record = value as Record<string, unknown>;
  const resumeValue = record.resume && typeof record.resume === "object"
    ? record.resume as Record<string, unknown>
    : null;

  return {
    full_name: typeof record.full_name === "string" ? record.full_name : "",
    email: typeof record.email === "string" ? record.email : email,
    phone: typeof record.phone === "string" ? record.phone : "",
    location: typeof record.location === "string" ? record.location : "",
    linkedin_url: typeof record.linkedin_url === "string" ? record.linkedin_url : "",
    portfolio_url: typeof record.portfolio_url === "string" ? record.portfolio_url : "",
    resume_text: typeof record.resume_text === "string" ? record.resume_text : "",
    resume: resumeValue && typeof resumeValue.filename === "string"
      ? {
          filename: resumeValue.filename,
          uploadedAt: typeof resumeValue.uploadedAt === "string" ? resumeValue.uploadedAt : "",
          sizeBytes: typeof resumeValue.sizeBytes === "number" ? resumeValue.sizeBytes : null
        }
      : resumeValue && typeof resumeValue.file_name === "string"
        ? {
            filename: resumeValue.file_name,
            uploadedAt: typeof resumeValue.uploaded_at === "string" ? resumeValue.uploaded_at : "",
            sizeBytes: typeof resumeValue.size_bytes === "number" ? resumeValue.size_bytes : null
          }
      : null
  };
}

export function App() {
  const [page, setPage] = useState<AppPage>("jobs");
  const [query, setQuery] = useState("");
  const [remoteStatus, setRemoteStatus] = useState("");
  const [pmFocus, setPmFocus] = useState("");
  const [sort, setSort] = useState("newest_seen");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [digest, setDigest] = useState<Record<string, Job[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(true);

  const [meta, setMeta] = useState<BoardMeta>({
    boardName: import.meta.env.VITE_BOARD_NAME ?? "jobpull",
    tagline: import.meta.env.VITE_TAGLINE ?? "",
    remoteOnly: true,
    focusCategories: [],
    claimed: false,
    visibility: "private",
    viewerCanBrowse: false,
    viewerIsOwner: false
  });
  const [viewer, setViewer] = useState<Viewer>({
    authenticated: false,
    isOwner: false,
    email: null,
    boardClaimed: false,
    boardVisibility: "private",
    hasResume: false
  });
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [profile, setProfile] = useState<UserProfile>(createEmptyProfile());
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeMessage, setResumeMessage] = useState("");

  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [subscribeMessage, setSubscribeMessage] = useState("");
  const [subscribeError, setSubscribeError] = useState("");

  const [claimEmail, setClaimEmail] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimSignInUrl, setClaimSignInUrl] = useState("");

  const [signInEmail, setSignInEmail] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInMessage, setSignInMessage] = useState("");
  const [signInError, setSignInError] = useState("");
  const [signInUrl, setSignInUrl] = useState("");

  const [trackerFavorite, setTrackerFavorite] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | "">("");
  const [trackerNotes, setTrackerNotes] = useState("");
  const [trackerBusy, setTrackerBusy] = useState(false);
  const [trackerMessage, setTrackerMessage] = useState("");
  const [myJobsFilter, setMyJobsFilter] = useState<"all" | "favorites" | TrackerStatus>("all");

  const trackedJobMap = useMemo(
    () => new Map(trackedJobs.map((job) => [job.id, job])),
    [trackedJobs]
  );

  const jobsPath = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("query", query);
    if (remoteStatus) p.set("remote_status", remoteStatus);
    if (pmFocus) p.set("pm_focus", pmFocus);
    if (sort) p.set("sort", sort);
    p.set("limit", "50");
    return `/api/jobs?${p.toString()}`;
  }, [query, remoteStatus, pmFocus, sort]);

  const hasActiveFilters = Boolean(query || remoteStatus || pmFocus || sort !== "newest_seen");
  const canBrowseBoard = meta.viewerCanBrowse || viewer.authenticated;
  const selectedTrackedJob = selectedJob ? trackedJobMap.get(selectedJob.id) ?? null : null;
  const filteredTrackedJobs = useMemo(() => {
    if (myJobsFilter === "all") {
      return trackedJobs;
    }
    if (myJobsFilter === "favorites") {
      return trackedJobs.filter((job) => job.favorite);
    }
    return trackedJobs.filter((job) => job.status === myJobsFilter);
  }, [myJobsFilter, trackedJobs]);

  async function refreshShell() {
    const [metaResult, meResult] = await Promise.all([
      fetchJson<unknown>("/api/meta").catch(() => null),
      fetchJson<unknown>("/api/me").catch(() => null)
    ]);

    const nextMeta = normalizeBoardMeta(metaResult);
    if (nextMeta) {
      setMeta(nextMeta);
    }

    const normalizedViewer = normalizeViewer(meResult);
    setViewer(normalizedViewer);
    const mePayload = meResult && typeof meResult === "object" ? meResult as OwnerMePayload : null;
    if (mePayload?.profile || mePayload?.resume !== undefined) {
      setProfile(normalizeProfile({
        ...(mePayload.profile ?? {}),
        resume: mePayload.resume ?? null
      }, normalizedViewer.email ?? ""));
    }
    if (normalizedViewer.email) {
      setProfile((current) => ({ ...current, email: current.email || normalizedViewer.email || "" }));
      setSignInEmail((current) => current || normalizedViewer.email || "");
      setClaimEmail((current) => current || normalizedViewer.email || "");
    }
  }

  async function refreshStats() {
    if (!canBrowseBoard) {
      setStats(null);
      return;
    }

    try {
      const nextStats = await fetchJson<unknown>("/api/stats");
      if (isBoardStats(nextStats)) {
        setStats(nextStats);
      }
    } catch {
      setStats(null);
    }
  }

  async function refreshTrackedJobs() {
    if (!viewer.authenticated) {
      setTrackedJobs([]);
      return;
    }

    try {
      const payload = await fetchJson<{ items: Array<Record<string, unknown>> }>("/api/me/jobs");
      setTrackedJobs(
        (payload.items ?? []).map((item) => {
          const state = item.state && typeof item.state === "object" ? item.state as Record<string, unknown> : {};
          return {
            ...(item as unknown as Job),
            favorite: state.favorite === true,
            status: typeof state.status === "string" ? state.status as TrackerStatus : null,
            notes: typeof state.notes === "string" ? state.notes : "",
            applied_at: typeof state.applied_at === "string" ? state.applied_at : null,
            rejected_at: typeof state.rejected_at === "string" ? state.rejected_at : null,
            updated_at: typeof state.updated_at === "string" ? state.updated_at : null
          };
        })
      );
    } catch {
      setTrackedJobs([]);
    }
  }

  async function refreshProfile() {
    if (!viewer.authenticated) {
      setProfile(createEmptyProfile());
      return;
    }

    try {
      const payload = await fetchJson<unknown>("/api/me/profile");
      setProfile((current) => ({
        ...normalizeProfile(payload, viewer.email ?? ""),
        resume: current.resume
      }));
    } catch {
      setProfile((current) => ({ ...createEmptyProfile(viewer.email ?? ""), resume: current.resume }));
    }
  }

  useEffect(() => {
    setBooting(true);
    refreshShell()
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!viewer.authenticated && (page === "myJobs" || page === "profile")) {
      setPage("jobs");
    }
  }, [page, viewer.authenticated]);

  useEffect(() => {
    void refreshStats();
  }, [canBrowseBoard]);

  useEffect(() => {
    if (!viewer.authenticated) {
      setTrackedJobs([]);
      setProfile(createEmptyProfile());
      return;
    }

    void Promise.all([refreshTrackedJobs(), refreshProfile()]);
  }, [viewer.authenticated, viewer.email]);

  useEffect(() => {
    if (page !== "jobs" || !canBrowseBoard) {
      return;
    }

    setLoading(true);
    setError("");
    fetchJson<{ items: Job[] }>(jobsPath)
      .then((data) => {
        setJobs(data.items);
        if (selectedJob) {
          const found = data.items.find((job) => job.id === selectedJob.id);
          if (found) {
            setSelectedJob((current) => current ? { ...found, description: current.description } : found);
          } else if (!trackedJobMap.has(selectedJob.id)) {
            setSelectedJob(null);
            setDetailError("");
            setDetailLoading(false);
          }
        }
      })
      .catch((issue) => setError(issue instanceof Error ? issue.message : String(issue)))
      .finally(() => setLoading(false));
  }, [jobsPath, page, canBrowseBoard]);

  useEffect(() => {
    if (page !== "digest" || !canBrowseBoard) {
      return;
    }

    setLoading(true);
    setError("");
    fetchJson<{ groups: Record<string, Job[]> }>("/api/digest/today")
      .then((data) => setDigest(data.groups))
      .catch((issue) => setError(issue instanceof Error ? issue.message : String(issue)))
      .finally(() => setLoading(false));
  }, [page, canBrowseBoard]);

  useEffect(() => {
    if (!selectedJob) {
      setTrackerFavorite(false);
      setTrackerStatus("");
      setTrackerNotes("");
      setTrackerMessage("");
      return;
    }

    const tracked = trackedJobMap.get(selectedJob.id);
    setTrackerFavorite(tracked?.favorite ?? false);
    setTrackerStatus(tracked?.status ?? "");
    setTrackerNotes(tracked?.notes ?? "");
    setTrackerMessage("");
  }, [selectedJob, trackedJobMap]);

  async function loadJobDetail(job: Job) {
    setSelectedJob(job);
    setDetailError("");
    setDetailLoading(!job.description);

    try {
      const fullJob = await fetchJson<Job>(`/api/jobs/${encodeURIComponent(job.id)}`);
      setSelectedJob((current) => (current?.id === fullJob.id ? fullJob : current));
    } catch (fetchError) {
      setDetailError(
        fetchError instanceof Error
          ? "Could not load full job details. Showing cached info instead."
          : "Could not load full job details."
      );
    } finally {
      setDetailLoading(false);
    }

    if (window.matchMedia("(max-width: 900px)").matches) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleDigestSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscribeBusy(true);
    setSubscribeError("");
    setSubscribeMessage("");

    try {
      const payload = await postJson<{ message: string }>("/api/subscriptions", { email: subscriberEmail });
      setSubscribeMessage(payload.message);
      setSubscriberEmail("");
    } catch (issue) {
      setSubscribeError(issue instanceof Error ? issue.message : "Could not subscribe right now.");
    } finally {
      setSubscribeBusy(false);
    }
  }

  async function handleClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClaimBusy(true);
    setClaimError("");
    setClaimMessage("");
    setClaimSignInUrl("");

    try {
      const payload = await fetchJson<OwnerLinkResponse>("/api/auth/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${claimToken}`
        },
        body: JSON.stringify({ email: claimEmail })
      });
      setClaimMessage(payload.message);
      setClaimSignInUrl(payload.signInUrl ?? "");
      setSignInEmail(claimEmail);
      setClaimToken("");
      await refreshShell();
    } catch (issue) {
      setClaimError(issue instanceof Error ? issue.message : "Could not claim this board.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function handleRequestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignInBusy(true);
    setSignInError("");
    setSignInMessage("");
    setSignInUrl("");

    try {
      const payload = await postJson<OwnerLinkResponse>("/api/auth/request-link", {
        email: signInEmail
      });
      setSignInMessage(payload.message);
      setSignInUrl(payload.signInUrl ?? "");
    } catch (issue) {
      setSignInError(issue instanceof Error ? issue.message : "Could not send a sign-in link.");
    } finally {
      setSignInBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await postJson<{ ok: boolean }>("/api/auth/logout", {});
    } finally {
      setSelectedJob(null);
      setPage("jobs");
      await refreshShell();
    }
  }

  async function saveTrackerState() {
    if (!selectedJob) {
      return;
    }

    setTrackerBusy(true);
    setTrackerMessage("");
    try {
      await putJson(`/api/me/jobs/${encodeURIComponent(selectedJob.id)}/state`, {
        favorite: trackerFavorite,
        status: trackerStatus || null,
        notes: trackerNotes
      });
      setTrackerMessage("Saved to your board.");
      await refreshTrackedJobs();
    } catch (issue) {
      setTrackerMessage(issue instanceof Error ? issue.message : "Could not save this job state.");
    } finally {
      setTrackerBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage("");
    try {
      const payload = await putJson<unknown>("/api/me/profile", profile);
      setProfile((current) => ({
        ...normalizeProfile(payload, viewer.email ?? ""),
        resume: current.resume
      }));
      setProfileMessage("Profile saved.");
      await refreshShell();
    } catch (issue) {
      setProfileMessage(issue instanceof Error ? issue.message : "Could not save your profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function uploadResume(file: File) {
    const formData = new FormData();
    formData.append("resume", file);

    setResumeBusy(true);
    setResumeMessage("");
    try {
      const payload = await uploadForm<unknown>("/api/me/resume", formData);
      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      setProfile(normalizeProfile({
        ...(record.profile && typeof record.profile === "object" ? record.profile as Record<string, unknown> : {}),
        resume: record.resume ?? null
      }, viewer.email ?? ""));
      setResumeMessage("Resume uploaded. Review the parsed profile fields below.");
      await refreshShell();
    } catch (issue) {
      setResumeMessage(issue instanceof Error ? issue.message : "Could not upload the resume.");
    } finally {
      setResumeBusy(false);
    }
  }

  async function removeResume() {
    setResumeBusy(true);
    setResumeMessage("");
    try {
      await deleteJson<unknown>("/api/me/resume");
      setProfile((current) => ({ ...current, resume: null }));
      setResumeMessage("Resume removed.");
      await refreshShell();
    } catch (issue) {
      setResumeMessage(issue instanceof Error ? issue.message : "Could not remove the resume.");
    } finally {
      setResumeBusy(false);
    }
  }

  function renderBoardAccessPanel() {
    if (!meta.claimed) {
      return (
        <section className="auth-shell">
          <div className="auth-card auth-card-wide">
            <div className="auth-hero">
              <div className="auth-copy">
                <span className="auth-kicker">Claim this board</span>
                <h2>Turn this install into your personal job board.</h2>
                <p>
                  Use the deployment-created admin token once, choose the owner email, and jobpull will send you a magic link to finish setup.
                </p>
              </div>
              <div className="auth-notes">
                <div className="auth-note">
                  <strong>Claim it once</strong>
                  <span>The admin token is only for the first ownership handoff. After that, the owner signs in with magic links.</span>
                </div>
                <div className="auth-note">
                  <strong>Private by default</strong>
                  <span>Your board stays private while you tune sources, track jobs, and upload your resume. Publish it later when you are ready.</span>
                </div>
              </div>
            </div>
            <form className="auth-form auth-form-grid" onSubmit={handleClaim}>
              <div className="auth-field">
                <label htmlFor="claim-email">Owner email</label>
                <input
                  id="claim-email"
                  type="email"
                  placeholder="you@example.com"
                  value={claimEmail}
                  onChange={(event) => setClaimEmail(event.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="claim-token">Admin token</label>
                <input
                  id="claim-token"
                  type="password"
                  placeholder="Deployment-created admin token"
                  value={claimToken}
                  onChange={(event) => setClaimToken(event.target.value)}
                />
              </div>
              <div className="auth-token-help">
                <div className="auth-help-card">
                  <strong>Local or dev</strong>
                  <span>
                    Look in <code>worker/.dev.vars</code> for the token created during setup.
                  </span>
                </div>
                <div className="auth-help-card">
                  <strong>Hosted or server installs</strong>
                  <span>Use the token saved in your deployment secrets or runtime environment.</span>
                </div>
              </div>
              <div className="auth-actions">
                <p className="auth-footnote">
                  {meta.auth?.magicLinkDelivery === "console"
                    ? "This deployment is configured to surface the sign-in link directly in the UI instead of sending email."
                    : "jobpull will email a sign-in link to the owner address and switch web admin to session-based access."}
                </p>
                <button className="btn-primary auth-submit" type="submit" disabled={claimBusy || !claimEmail.trim() || !claimToken.trim()}>
                  {claimBusy ? "Claiming…" : "Claim this board"}
                </button>
              </div>
            </form>
            {claimSignInUrl && (
              <div className="auth-link-card">
                <strong>Local sign-in link</strong>
                <p>Open the generated owner link to finish setup in this browser.</p>
                <a className="btn-secondary auth-open-link" href={claimSignInUrl}>
                  Open sign-in link
                </a>
              </div>
            )}
            {(claimMessage || claimError) && (
              <p className={`auth-message ${claimError ? "auth-message-error" : ""}`}>
                {claimError || claimMessage}
              </p>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="auth-shell">
        <div className="auth-card auth-card-wide">
          <div className="auth-hero">
            <div className="auth-copy">
              <span className="auth-kicker">Owner sign-in</span>
              <h2>Email yourself a magic link.</h2>
              <p>
                This board belongs to one owner in v1. Enter the owner email and jobpull will send a short-lived sign-in link.
              </p>
            </div>
            <div className="auth-notes">
              <div className="auth-note">
                <strong>One owner per board</strong>
                <span>Use the same owner email you chose when you claimed the board.</span>
              </div>
              <div className="auth-note">
                <strong>No admin token needed</strong>
                <span>After claim, normal web access uses the magic link session instead of the deployment token.</span>
              </div>
            </div>
          </div>
          <form className="auth-form auth-form-grid auth-form-single" onSubmit={handleRequestLink}>
            <div className="auth-field">
              <label htmlFor="signin-email">Owner email</label>
              <input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
              />
            </div>
            <div className="auth-actions">
              <p className="auth-footnote">
                {meta.auth?.magicLinkDelivery === "console"
                  ? "This deployment is configured to show the sign-in link directly so you can test locally without email."
                  : "The sign-in link is short-lived and opens the private board directly in this browser."}
              </p>
              <button className="btn-primary auth-submit" type="submit" disabled={signInBusy || !signInEmail.trim()}>
                {signInBusy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </div>
          </form>
          {signInUrl && (
            <div className="auth-link-card">
              <strong>Local sign-in link</strong>
              <p>Open the generated owner link to restore your session in this browser.</p>
              <a className="btn-secondary auth-open-link" href={signInUrl}>
                Open sign-in link
              </a>
            </div>
          )}
          {(signInMessage || signInError) && (
            <p className={`auth-message ${signInError ? "auth-message-error" : ""}`}>
              {signInError || signInMessage}
            </p>
          )}
        </div>
      </section>
    );
  }

  function renderPrivateGate() {
    return (
      <section className="private-gate">
        <div className="empty-state">
          <p className="empty-icon">🔒</p>
          <p>{meta.claimed ? "This board is private." : "This board hasn’t been claimed yet."}</p>
          <p className="empty-hint">
            {meta.claimed
              ? "Use the Admin tab to email the owner sign-in link and browse privately."
              : "Use the Admin tab to claim this install and start building your personal board."}
          </p>
          <button className="btn-secondary" type="button" onClick={() => setPage("settings")}>
            {meta.claimed ? "Open Admin" : "Claim this board"}
          </button>
        </div>
      </section>
    );
  }

  function renderTrackerControls() {
    if (!viewer.authenticated || !selectedJob) {
      return null;
    }

    return (
      <div className="tracker-panel">
        <div className="tracker-panel-head">
          <strong>Your tracking</strong>
          <span>{selectedTrackedJob ? "Already on your board" : "Not tracked yet"}</span>
        </div>
        <div className="tracker-grid">
          <label className="admin-checkbox" htmlFor="tracker-favorite">
            <input
              id="tracker-favorite"
              type="checkbox"
              checked={trackerFavorite}
              onChange={(event) => setTrackerFavorite(event.target.checked)}
            />
            <span>Favorite this job</span>
          </label>
          <label htmlFor="tracker-status">Status</label>
          <select
            id="tracker-status"
            value={trackerStatus}
            onChange={(event) => setTrackerStatus(event.target.value as TrackerStatus | "")}
          >
            <option value="">Not tracked yet</option>
            {TRACKER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {titleCase(status)}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor="tracker-notes">Notes</label>
        <textarea
          id="tracker-notes"
          rows={4}
          placeholder="Why you like this role, follow-up notes, referral info, or anything else worth remembering."
          value={trackerNotes}
          onChange={(event) => setTrackerNotes(event.target.value)}
        />
        <div className="tracker-actions">
          <button className="btn-primary" type="button" onClick={saveTrackerState} disabled={trackerBusy}>
            {trackerBusy ? "Saving…" : "Save tracking"}
          </button>
          <a className="apply-btn" href={selectedJob.url} target="_blank" rel="noreferrer">
            Open application →
          </a>
        </div>
        {trackerMessage && <p className="detail-status">{trackerMessage}</p>}
      </div>
    );
  }

  function renderJobsList(items: Job[], emptyTitle: string, emptyHint: string) {
    if (items.length === 0 && !loading) {
      return (
        <div className="empty-state">
          <p className="empty-icon">🔍</p>
          <p>{emptyTitle}</p>
          <p className="empty-hint">{emptyHint}</p>
          {page === "jobs" && hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary btn-secondary-sm"
              onClick={() => {
                setQuery("");
                setRemoteStatus("");
                setPmFocus("");
                setSort("newest_seen");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      );
    }

    return (
      <>
        {items.map((job) => {
          const tracked = trackedJobMap.get(job.id);
          return (
            <button
              key={job.id}
              className={`job ${selectedJob?.id === job.id ? "selected" : ""}`}
              onClick={() => {
                void loadJobDetail(job);
              }}
            >
              <strong>{job.title}</strong>
              <span className="job-company">{job.company}</span>
              <span className="job-location">{job.location}</span>
              <div className="job-badges">
                <span className="badge badge-focus">{job.pm_focus}</span>
                <span className="badge badge-remote">{job.remote_status}</span>
                {tracked?.favorite && <span className="badge badge-tag">favorite</span>}
                {tracked?.status && <span className="badge badge-date">{tracked.status}</span>}
                {job.date_posted && <span className="badge badge-date">{timeAgo(job.date_posted)}</span>}
              </div>
            </button>
          );
        })}
      </>
    );
  }

  function renderBoardDetail() {
    return (
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
            {selectedTrackedJob && (
              <div className="detail-inline-summary">
                <span>Tracked: {formatTrackerStatus(selectedTrackedJob.status)}</span>
                {selectedTrackedJob.favorite && <span>Favorited</span>}
              </div>
            )}
            {detailError && <p className="detail-status detail-status-error">{detailError}</p>}
            {detailLoading && !selectedJob.description && (
              <p className="detail-status">Loading full job details…</p>
            )}
            {selectedJob.description ? (
              <p className="description">{selectedJob.description}</p>
            ) : (
              <p className="description">No description available.</p>
            )}
            {renderTrackerControls()}
            {!viewer.authenticated && (
              <a className="apply-btn" href={selectedJob.url} target="_blank" rel="noreferrer">
                View job posting →
              </a>
            )}
          </>
        )}
      </aside>
    );
  }

  if (booting) {
    return <main className="layout"><p className="loading-text">Loading…</p></main>;
  }

  return (
    <main className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>{meta.boardName}</h1>
          {meta.tagline && <p className="tagline">{meta.tagline}</p>}
        </div>
        <div className="topbar-controls">
          {viewer.authenticated && viewer.email && (
            <div className="session-pill">
              <span>{viewer.email}</span>
              <button type="button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          )}
          <div className="tabs">
            <button id="tab-jobs" className={page === "jobs" ? "active" : ""} onClick={() => setPage("jobs")}>Jobs</button>
            <button id="tab-digest" className={page === "digest" ? "active" : ""} onClick={() => setPage("digest")}>Today&apos;s Digest</button>
            {viewer.authenticated && (
              <>
                <button id="tab-my-jobs" className={page === "myJobs" ? "active" : ""} onClick={() => setPage("myJobs")}>My Jobs</button>
                <button id="tab-profile" className={page === "profile" ? "active" : ""} onClick={() => setPage("profile")}>Profile</button>
              </>
            )}
            <button id="tab-settings" className={page === "settings" ? "active" : ""} onClick={() => setPage("settings")}>
              {viewer.authenticated ? "Admin" : meta.claimed ? "Sign In" : "Claim Board"}
            </button>
          </div>
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

      {meta.visibility === "public" && page !== "settings" && page !== "profile" && page !== "myJobs" && (
        <section className="subscribe-bar" aria-label="Daily digest signup">
          <div>
            <strong>Get the daily digest</strong>
            <p>Subscribe once, confirm by email, and get the next scheduled digest in your inbox.</p>
          </div>
          <form className="subscribe-form" onSubmit={handleDigestSubscribe}>
            <label className="sr-only" htmlFor="digest-email">Email address</label>
            <input
              id="digest-email"
              type="email"
              placeholder="you@example.com"
              value={subscriberEmail}
              onChange={(event) => setSubscriberEmail(event.target.value)}
            />
            <button className="btn-primary" type="submit" disabled={subscribeBusy || !subscriberEmail.trim()}>
              {subscribeBusy ? "Sending…" : "Subscribe"}
            </button>
          </form>
          {(subscribeMessage || subscribeError) && (
            <p className={`subscribe-status ${subscribeError ? "subscribe-status-error" : ""}`}>
              {subscribeError || subscribeMessage}
            </p>
          )}
        </section>
      )}

      {page === "settings" && (
        viewer.authenticated ? (
          <SettingsPanel apiBase={API_BASE} onExitToJobs={() => setPage("jobs")} />
        ) : (
          renderBoardAccessPanel()
        )
      )}

      {page === "profile" && viewer.authenticated && (
        <section className="profile-shell">
          <div className="profile-card">
            <div className="profile-card-head">
              <div>
                <h2>Your profile</h2>
                <p>Keep one resume and one editable profile for your personal board.</p>
              </div>
            </div>
            <form className="profile-form" onSubmit={saveProfile}>
              <div className="profile-grid">
                <label>
                  Full name
                  <input
                    value={profile.full_name}
                    onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={profile.phone}
                    onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
                <label>
                  Location
                  <input
                    value={profile.location}
                    onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))}
                  />
                </label>
                <label>
                  LinkedIn URL
                  <input
                    value={profile.linkedin_url}
                    onChange={(event) => setProfile((current) => ({ ...current, linkedin_url: event.target.value }))}
                  />
                </label>
                <label>
                  Portfolio URL
                  <input
                    value={profile.portfolio_url}
                    onChange={(event) => setProfile((current) => ({ ...current, portfolio_url: event.target.value }))}
                  />
                </label>
              </div>

              <label>
                Parsed resume text
                <textarea
                  rows={8}
                  value={profile.resume_text}
                  onChange={(event) => setProfile((current) => ({ ...current, resume_text: event.target.value }))}
                />
              </label>

              <div className="resume-card">
                <div>
                  <strong>{profile.resume ? profile.resume.filename : "No resume uploaded yet"}</strong>
                  <p className="field-hint">
                    {profile.resume
                      ? `Uploaded ${timeAgo(profile.resume.uploadedAt)}`
                      : "Upload a PDF resume. jobpull will keep the file and try to pull profile details from it."}
                  </p>
                </div>
                <div className="resume-actions">
                  <label className="btn-secondary btn-upload">
                    {resumeBusy ? "Uploading…" : "Upload PDF"}
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadResume(file);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {profile.resume && (
                    <button className="btn-secondary" type="button" onClick={removeResume} disabled={resumeBusy}>
                      Remove resume
                    </button>
                  )}
                </div>
              </div>

              <div className="profile-actions">
                <button className="btn-primary" type="submit" disabled={profileBusy}>
                  {profileBusy ? "Saving…" : "Save profile"}
                </button>
              </div>
              {(profileMessage || resumeMessage) && (
                <p className="settings-message">{resumeMessage || profileMessage}</p>
              )}
            </form>
          </div>
        </section>
      )}

      {page === "myJobs" && viewer.authenticated && (
        <>
          <section className="filters">
            <label className="sr-only" htmlFor="my-jobs-filter">My jobs filter</label>
            <select id="my-jobs-filter" value={myJobsFilter} onChange={(event) => setMyJobsFilter(event.target.value as typeof myJobsFilter)}>
              <option value="all">All tracked jobs</option>
              <option value="favorites">Favorites</option>
              {TRACKER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </select>
          </section>
          <section className={`board ${selectedJob ? "has-selected" : ""}`}>
            <div className="list">
              {renderJobsList(
                filteredTrackedJobs,
                "You haven’t tracked any jobs yet.",
                "Save a few roles from the board, then come back here to manage status and notes."
              )}
            </div>
            {renderBoardDetail()}
          </section>
        </>
      )}

      {page === "jobs" && (
        canBrowseBoard ? (
          <>
            <section className="filters">
              <label className="sr-only" htmlFor="search-input">Search jobs</label>
              <input
                id="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title or company…"
              />
              <label className="sr-only" htmlFor="filter-remote">Remote status</label>
              <select id="filter-remote" value={remoteStatus} onChange={(event) => setRemoteStatus(event.target.value)}>
                <option value="">All remote statuses</option>
                <option value="remote">Remote</option>
                <option value="unknown">Unknown</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
              <label className="sr-only" htmlFor="filter-focus">Focus area</label>
              <select id="filter-focus" value={pmFocus} onChange={(event) => setPmFocus(event.target.value)}>
                <option value="">All focus areas</option>
                {meta.focusCategories.length > 0
                  ? meta.focusCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {titleCase(cat)}
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
                  )}
              </select>
              <label className="sr-only" htmlFor="filter-sort">Sort jobs</label>
              <select id="filter-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="newest_seen">Newest seen</option>
                <option value="newest_posted">Newest posted</option>
              </select>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-secondary btn-secondary-sm filters-reset"
                  onClick={() => {
                    setQuery("");
                    setRemoteStatus("");
                    setPmFocus("");
                    setSort("newest_seen");
                  }}
                >
                  Clear filters
                </button>
              )}
            </section>

            {error && <p className="error">{error}</p>}
            {loading ? <p className="loading-text">Loading…</p> : null}

            <section className={`board ${selectedJob ? "has-selected" : ""}`}>
              <div className="list">
                {renderJobsList(
                  jobs,
                  hasActiveFilters ? "No jobs match your current filters." : "No jobs are visible yet.",
                  hasActiveFilters
                    ? "Clear a filter or broaden your search to see more roles."
                    : "Run a crawl or check back after the next scheduled update."
                )}
              </div>
              {renderBoardDetail()}
            </section>
          </>
        ) : (
          renderPrivateGate()
        )
      )}

      {page === "digest" && (
        canBrowseBoard ? (
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
        ) : (
          renderPrivateGate()
        )
      )}

      <footer className="site-footer">
        <p>
          Powered by <a href="https://github.com/farmanp/jobpull" target="_blank" rel="noreferrer">jobpull</a>
          {" · "}Free &amp; open source
        </p>
      </footer>
    </main>
  );
}
