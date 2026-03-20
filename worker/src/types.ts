export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  SESSION_SECRET?: string;
  MAGIC_LINK_DELIVERY?: string;
  BOARD_VISIBILITY_DEFAULT?: string;
  ALLOW_UNCLAIMED_BROWSE?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  PUBLIC_BASE_URL?: string;
  USER_AGENT?: string;
  DEFAULT_TIMEOUT_MS?: string;
  DEFAULT_MAX_RETRIES?: string;
  HOST_CONCURRENCY?: string;
  HOST_SPACING_MS?: string;
  STALE_THRESHOLD_DAYS?: string;
  CRON_SCHEDULE?: string;
  RUNTIME_PLATFORM?: "cloudflare" | "server";
  getRuntimeSchedule?: () => Promise<string>;
  setRuntimeSchedule?: (schedule: string) => Promise<void>;
}

export type CrawlTrigger = "manual" | "scheduled";

export type BoardVisibility = "private" | "public";
export type OwnerUserStatus = "owner";
export type MagicLinkPurpose = "claim" | "sign_in";
export type JobUserStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected" | "archived";

export interface BoardStateRecord {
  id: string;
  owner_user_id: string | null;
  visibility: BoardVisibility;
  claimed_at: string | null;
  published_at: string | null;
}

export interface UserRecord {
  id: string;
  email: string;
  status: OwnerUserStatus | string;
  created_at: string;
  last_seen_at: string | null;
}

export interface MagicLinkRecord {
  id: string;
  user_id: string;
  purpose: MagicLinkPurpose | string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface JobUserStateRecord {
  user_id: string;
  job_id: string;
  favorite: number;
  status: JobUserStatus | string;
  notes: string | null;
  applied_at: string | null;
  rejected_at: string | null;
  updated_at: string;
}

export interface UserProfileRecord {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  resume_text: string | null;
  updated_at: string;
}

export interface UserResumeRecord {
  id: string;
  user_id: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  file_blob: ArrayBuffer | null;
  resume_text: string | null;
  uploaded_at: string;
  is_active: number;
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
  trigger: CrawlTrigger;
}
