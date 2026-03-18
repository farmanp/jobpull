import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";
import { normalizeDescriptionText } from "../lib/text";

interface PersonioXmlConfig {
  companySlug: string;
  language?: string;
}

function collectTagBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  return Array.from(xml.matchAll(pattern), (match) => match[1] ?? "");
}

function extractTagValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!match?.[1]) {
    return undefined;
  }

  const value = normalizeDescriptionText(match[1]);
  return value || undefined;
}

function buildPersonioDescription(positionXml: string): string {
  return collectTagBlocks(positionXml, "jobDescription")
    .map((jobDescriptionXml) => {
      const name = extractTagValue(jobDescriptionXml, "name");
      const value = extractTagValue(jobDescriptionXml, "value");
      if (!name && !value) {
        return "";
      }
      return [name, value].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildPersonioLocation(positionXml: string): string {
  const offices = collectTagBlocks(positionXml, "office")
    .map((office) => normalizeDescriptionText(office))
    .filter(Boolean);

  return Array.from(new Set(offices)).join(", ") || "Unknown";
}

function inferPersonioRemoteStatus(location: string): JobCandidate["remote_status"] {
  return /\bremote\b/i.test(location) ? "remote" : undefined;
}

export async function fetchPersonioXmlJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as PersonioXmlConfig;
  const companySlug = config.companySlug.trim().replace(/^https?:\/\//, "").replace(/\.jobs\.personio\.de\/?$/, "");
  const language = config.language?.trim() || "en";
  const baseUrl = `https://${companySlug}.jobs.personio.de`;
  const url = `${baseUrl}/xml?language=${encodeURIComponent(language)}`;
  const response = await client.fetchText(url);
  if (response.notModified || !response.text) {
    return [];
  }

  return collectTagBlocks(response.text, "position")
    .map((positionXml) => {
      const id = extractTagValue(positionXml, "id") ?? "";
      const description = buildPersonioDescription(positionXml);
      const location = buildPersonioLocation(positionXml);
      return {
        title: extractTagValue(positionXml, "name") ?? "",
        company: extractTagValue(positionXml, "subcompany") ?? source.name.replace(/ Personio XML$/, ""),
        location,
        url: id ? `${baseUrl}/job/${id}` : "",
        source: "personio_xml",
        date_posted: extractTagValue(positionXml, "createdAt"),
        description,
        remote_status: inferPersonioRemoteStatus(location)
      };
    })
    .filter((job) => Boolean(job.title && job.url) && isTargetRole(job.title, job.description));
}
