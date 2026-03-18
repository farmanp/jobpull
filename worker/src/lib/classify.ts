/**
 * Role classification utilities — config-driven.
 *
 * Replaces the hard-coded PM logic from pm.ts.
 * All matching rules read from the active BoardConfig.
 */

import { getConfig } from "../config";
import type { PMFocus, RemoteStatus } from "../types";

/* ------------------------------------------------------------------ */
/*  Role Matching                                                      */
/* ------------------------------------------------------------------ */

export function isTargetRole(title: string, description?: string): boolean {
  const config = getConfig();
  const normalizedTitle = title.toLowerCase();

  // Exclude patterns take priority
  for (const rule of config.titleExcludePatterns) {
    if (new RegExp(rule.source, "i").test(normalizedTitle)) {
      return false;
    }
  }

  // Check include patterns
  for (const rule of config.titleIncludePatterns) {
    if (new RegExp(rule.source, "i").test(normalizedTitle)) {
      return true;
    }
  }

  // Fallback: check description-level heuristics
  if (config.descriptionFallback) {
    const fb = config.descriptionFallback;
    const normalizedDescription = (description ?? "").toLowerCase();
    return (
      new RegExp(fb.titlePattern, "i").test(normalizedTitle) &&
      new RegExp(fb.descriptionInclude, "i").test(normalizedDescription) &&
      !new RegExp(fb.descriptionExclude, "i").test(normalizedDescription)
    );
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Remote Status                                                      */
/* ------------------------------------------------------------------ */

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

export function shouldKeepForRemoteBoard(remoteStatus: RemoteStatus): boolean {
  const config = getConfig();
  if (!config.remoteOnly) {
    return true;
  }
  return remoteStatus === "remote" || remoteStatus === "hybrid";
}

/* ------------------------------------------------------------------ */
/*  Focus Category                                                     */
/* ------------------------------------------------------------------ */

export function inferFocus(title: string, description?: string): PMFocus {
  const config = getConfig();
  const hay = `${title} ${description ?? ""}`.toLowerCase();

  for (const cat of config.focusCategories) {
    if (new RegExp(cat.source, "i").test(hay)) {
      return cat.label as PMFocus;
    }
  }

  return "unknown";
}

/* ------------------------------------------------------------------ */
/*  Auto-Tagging                                                       */
/* ------------------------------------------------------------------ */

export function inferTags(title: string, description?: string, location?: string): string[] {
  const config = getConfig();
  const hay = `${title} ${description ?? ""} ${location ?? ""}`.toLowerCase();

  return config.tagKeywords
    .filter(({ source }) => new RegExp(source, "i").test(hay))
    .map(({ tag }) => tag);
}
