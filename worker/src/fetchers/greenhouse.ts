import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";

interface GreenhouseConfig {
  boardToken: string;
  departmentKeywords?: string[];
}

interface GreenhouseResponse {
  jobs: Array<{
    title: string;
    absolute_url: string;
    updated_at?: string;
    content?: string;
    location?: { name?: string };
    departments?: Array<{ name?: string }>;
  }>;
}

export async function fetchGreenhouseJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as GreenhouseConfig;
  const url = `${source.base_url.replace(/\/$/, "")}/v1/boards/${config.boardToken}/jobs?content=true`;
  const response = await client.fetchText(url);
  if (response.notModified || !response.text) {
    return [];
  }

  const json = JSON.parse(response.text) as GreenhouseResponse;
  const deptKeywords = (config.departmentKeywords ?? ["product"]).map((k) => k.toLowerCase());

  return json.jobs
    .filter((job) => {
      const departmentText = (job.departments ?? []).map((d) => d.name ?? "").join(" ").toLowerCase();
      const deptMatch = deptKeywords.some((k) => departmentText.includes(k));
      return deptMatch || isTargetRole(job.title, job.content);
    })
    .map((job) => ({
      title: job.title,
      company: source.name.replace(/ Greenhouse$/, ""),
      location: job.location?.name ?? "Unknown",
      url: job.absolute_url,
      source: "greenhouse",
      date_posted: job.updated_at,
      description: job.content ?? ""
    }));
}
