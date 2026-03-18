import { canonicalizeUrl } from "./hash";
import type { NormalizedJob } from "../types";

export function dedupeJobs(items: NormalizedJob[]): NormalizedJob[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const out: NormalizedJob[] = [];

  for (const item of items) {
    const canonicalUrl = canonicalizeUrl(item.url);
    if (seenIds.has(item.id) || seenUrls.has(canonicalUrl)) {
      continue;
    }

    seenIds.add(item.id);
    seenUrls.add(canonicalUrl);
    out.push({ ...item, url: canonicalUrl });
  }

  return out;
}
