import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";

interface LeverConfig {
  site: string;
  teamKeywords?: string[];
}

interface LeverPosting {
  text: string;
  hostedUrl: string;
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    team?: string;
  };
}

export async function fetchLeverJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as LeverConfig;
  const url = `${source.base_url.replace(/\/$/, "")}/v0/postings/${config.site}?mode=json`;
  const response = await client.fetchText(url);
  if (response.notModified || !response.text) {
    return [];
  }

  const json = JSON.parse(response.text) as LeverPosting[];
  const teamKeywords = (config.teamKeywords ?? ["product"]).map((k) => k.toLowerCase());

  return json
    .filter((job) => {
      const team = (job.categories?.team ?? "").toLowerCase();
      const teamMatch = teamKeywords.some((k) => team.includes(k));
      return teamMatch || isTargetRole(job.text, job.descriptionPlain ?? job.description);
    })
    .map((job) => ({
      title: job.text,
      company: source.name.replace(/ Lever$/, ""),
      location: job.categories?.location ?? "Unknown",
      url: job.hostedUrl,
      source: "lever",
      date_posted: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      description: job.descriptionPlain ?? job.description ?? ""
    }));
}
