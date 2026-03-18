export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  USER_AGENT?: string;
  DEFAULT_TIMEOUT_MS?: string;
  DEFAULT_MAX_RETRIES?: string;
  HOST_CONCURRENCY?: string;
  HOST_SPACING_MS?: string;
  STALE_THRESHOLD_DAYS?: string;
}

export type SourceType = "greenhouse" | "lever" | "remote_json" | "ashby" | "recruitee" | "personio_xml";

export interface SourceRecord {
  id: string;
  type: SourceType;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
}

export type RemoteStatus = "remote" | "hybrid" | "onsite" | "unknown";
export type PMFocus = "growth" | "platform" | "core" | "technical" | "unknown";

export interface JobCandidate {
  title: string;
  company: string;
  location: string;
  url: string;
  source: string;
  date_posted?: string;
  description?: string;
  remote_status?: RemoteStatus;
}

export interface NormalizedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  remote_status: RemoteStatus;
  url: string;
  source: string;
  date_posted?: string;
  date_seen: string;
  description: string;
  tags: string[];
  pm_focus: PMFocus;
}

export interface CrawlError {
  sourceId?: string;
  url?: string;
  message: string;
}

export interface CrawlSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  jobsAdded: number;
  errors: CrawlError[];
  status: "success" | "partial" | "failed";
}
