import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";
import { normalizeDescriptionText } from "../lib/text";

interface AshbyConfig {
  organizationSlug: string;
}

interface AshbyJob {
  title?: string;
  location?: string;
  publishedAt?: string;
  isRemote?: boolean;
  workplaceType?: string;
  jobUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

function inferAshbyRemoteStatus(job: AshbyJob): JobCandidate["remote_status"] {
  const workplaceType = (job.workplaceType ?? "").toLowerCase();

  if (job.isRemote === true || workplaceType.includes("remote")) {
    return "remote";
  }

  if (workplaceType.includes("hybrid")) {
    return "hybrid";
  }

  if (workplaceType.includes("on-site") || workplaceType.includes("onsite") || workplaceType.includes("office")) {
    return "onsite";
  }

  return undefined;
}

export async function fetchAshbyJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as AshbyConfig;
  const url = `${source.base_url.replace(/\/$/, "")}/posting-api/job-board/${config.organizationSlug}`;
  const response = await client.fetchText(url);
  if (response.notModified || !response.text) {
    return [];
  }

  const payload = JSON.parse(response.text) as AshbyResponse;

  return (payload.jobs ?? [])
    .map((job) => {
      const description = normalizeDescriptionText(job.descriptionPlain ?? job.descriptionHtml ?? "");
      return {
        title: job.title ?? "",
        company: source.name.replace(/ Ashby$/, ""),
        location: job.location ?? (job.isRemote ? "Remote" : "Unknown"),
        url: job.jobUrl ?? "",
        source: "ashby",
        date_posted: job.publishedAt,
        description,
        remote_status: inferAshbyRemoteStatus(job)
      };
    })
    .filter((job) => Boolean(job.title && job.url) && isTargetRole(job.title, job.description));
}
