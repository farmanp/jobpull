import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";

interface RemoteJsonConfig {
  url: string;
  sourceLabel?: string;
  assumeRemote?: boolean;
}

interface RemoteOkItem {
  title?: string;
  position?: string;
  company?: string;
  company_name?: string;
  location?: string;
  candidate_required_location?: string;
  url?: string;
  job_url?: string;
  description?: string;
  date?: string;
  created_at?: string;
  publication_date?: string;
  epoch?: number;
  remote?: boolean | string;
  job_type?: string;
  job_types?: string[];
  locations?: string[];
  location_base?: string;
  location_extra?: string;
  apply_url?: string;
  pub_date?: string;
}

function inferRemoteStatusFromRaw(item: RemoteOkItem, assumeRemote = false): JobCandidate["remote_status"] {
  if (item.remote === true) {
    return "remote";
  }

  const hay = [
    typeof item.remote === "string" ? item.remote : "",
    item.location ?? "",
    item.candidate_required_location ?? "",
    item.location_base ?? "",
    item.location_extra ?? "",
    Array.isArray(item.locations) ? item.locations.join(" ") : "",
    item.job_type ?? "",
    Array.isArray(item.job_types) ? item.job_types.join(" ") : ""
  ]
    .join(" ")
    .toLowerCase();

  if (/\bremote\b|work from anywhere|worldwide|global/.test(hay)) {
    return "remote";
  }

  if (/\bhybrid\b/.test(hay)) {
    return "hybrid";
  }

  if (/\bonsite\b|on-site|in office/.test(hay)) {
    return "onsite";
  }

  if (assumeRemote) {
    return "remote";
  }

  return undefined;
}

function extractItems(payload: unknown): RemoteOkItem[] {
  if (Array.isArray(payload)) {
    return payload as RemoteOkItem[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.jobs)) {
      return record.jobs as RemoteOkItem[];
    }
    if (Array.isArray(record.data)) {
      return record.data as RemoteOkItem[];
    }
    const hits = record.hits as Record<string, unknown> | undefined;
    if (hits && Array.isArray(hits.hits)) {
      return (hits.hits as Array<Record<string, unknown>>)
        .map((hit) => (hit._source && typeof hit._source === "object" ? (hit._source as RemoteOkItem) : null))
        .filter((item): item is RemoteOkItem => Boolean(item));
    }
  }

  return [];
}

export function parseRemoteJsonItems(
  items: RemoteOkItem[],
  source: SourceRecord,
  sourceLabel?: string,
  assumeRemote = false
): JobCandidate[] {
  return items
    .filter((item) => {
      const title = item.position ?? item.title ?? "";
      const description = item.description ?? "";
      return Boolean(title && (item.url ?? item.job_url ?? item.apply_url ?? "")) && isTargetRole(title, description);
    })
    .map((item) => {
      const remoteStatus = inferRemoteStatusFromRaw(item, assumeRemote);
      const location =
        item.location ??
        item.candidate_required_location ??
        item.location_base ??
        item.location_extra ??
        (Array.isArray(item.locations) && item.locations.length > 0 ? item.locations.join(", ") : undefined) ??
        (remoteStatus === "remote" ? "Remote" : "Unknown");

      return {
        title: item.position ?? item.title ?? "",
        company: item.company ?? item.company_name ?? source.name,
        location,
        url: item.url ?? item.job_url ?? item.apply_url ?? "",
        source: sourceLabel ?? source.type,
        date_posted:
          item.publication_date ??
          item.pub_date ??
          item.created_at ??
          (item.epoch ? new Date(item.epoch * 1000).toISOString() : item.date),
        description: item.description ?? "",
        remote_status: remoteStatus
      };
    });
}

export async function fetchRemoteJsonJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as RemoteJsonConfig;
  const response = await client.fetchText(config.url);
  if (response.notModified || !response.text) {
    return [];
  }

  const payload = JSON.parse(response.text) as unknown;
  return parseRemoteJsonItems(extractItems(payload), source, config.sourceLabel, config.assumeRemote === true);
}
