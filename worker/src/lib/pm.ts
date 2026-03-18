import type { PMFocus, RemoteStatus } from "../types";

const PM_TITLE_INCLUDE_RE =
  /\b(product manager|group product manager|principal product manager|staff product manager|senior product manager|associate product manager|technical product manager|platform product manager|growth product manager|head of product|director of product|vp product|vice president,? product|chief product officer|product owner)\b/i;
const PM_TITLE_EXCLUDE_RE =
  /\b(project manager|program manager|product marketing|product designer|product design|product analyst|data product manager|engineering manager|software engineer|sales|account manager|customer success)\b/i;

export function isProductManagementRole(title: string, description?: string): boolean {
  const normalizedTitle = title.toLowerCase();

  if (PM_TITLE_EXCLUDE_RE.test(normalizedTitle)) {
    return false;
  }

  if (PM_TITLE_INCLUDE_RE.test(normalizedTitle)) {
    return true;
  }

  // Fallback for abbreviated PM titles like "PM, Growth".
  const normalizedDescription = (description ?? "").toLowerCase();
  return /\bpm\b/.test(normalizedTitle) && /\bproduct\b/.test(normalizedDescription) && !/\bproject\b/.test(normalizedDescription);
}

export function inferRemoteStatus(location: string, description?: string): RemoteStatus {
  const hay = `${location} ${description ?? ""}`.toLowerCase();

  if (/\bremote\b|work from home|distributed|remote-first|work from anywhere|worldwide|global/.test(hay)) {
    return "remote";
  }

  if (/\bhybrid\b/.test(hay)) {
    return "hybrid";
  }

  if (/\bonsite\b|on-site|in office/.test(hay)) {
    return "onsite";
  }

  return "unknown";
}

export function inferPMFocus(title: string, description?: string): PMFocus {
  const hay = `${title} ${description ?? ""}`.toLowerCase();
  if (/growth|acquisition|retention|activation/.test(hay)) {
    return "growth";
  }

  if (/platform|infrastructure|api/.test(hay)) {
    return "platform";
  }

  if (/technical|developer|engineering/.test(hay)) {
    return "technical";
  }

  if (/core product|product experience|consumer product/.test(hay)) {
    return "core";
  }

  return "unknown";
}

const TAG_KEYWORDS: Record<string, RegExp> = {
  remote: /\bremote\b|distributed/,
  b2b: /\bb2b\b|enterprise/,
  b2c: /\bb2c\b|consumer/,
  ai: /\bai\b|machine learning|llm|artificial intelligence/,
  fintech: /fintech|payments|banking/,
  healthcare: /healthcare|health tech|medtech/,
  saas: /saas|software as a service/,
  marketplace: /marketplace|two-sided/,
  data: /data platform|analytics|bi /
};

export function inferTags(title: string, description?: string, location?: string): string[] {
  const hay = `${title} ${description ?? ""} ${location ?? ""}`.toLowerCase();
  return Object.entries(TAG_KEYWORDS)
    .filter(([, pattern]) => pattern.test(hay))
    .map(([tag]) => tag);
}

export function shouldKeepForRemoteBoard(remoteStatus: RemoteStatus): boolean {
  return remoteStatus === "remote" || remoteStatus === "hybrid";
}
