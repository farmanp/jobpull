import type { JobCandidate, SourceRecord } from "../types";
import { isTargetRole } from "../lib/classify";
import { SafeFetchClient } from "../lib/fetchClient";
import { normalizeDescriptionText } from "../lib/text";

interface RecruiteeConfig {
  subdomain: string;
}

interface RecruiteeTranslation {
  title?: string;
  description?: string;
}

interface RecruiteeOffer {
  title?: string;
  description?: string;
  company_name?: string;
  careers_url?: string;
  careers_apply_url?: string;
  location?: string;
  city?: string;
  country?: string;
  remote?: boolean;
  hybrid?: boolean;
  on_site?: boolean;
  created_at?: string;
  translations?: Record<string, RecruiteeTranslation>;
}

interface RecruiteeResponse {
  offers?: RecruiteeOffer[];
}

function pickTranslatedField(offer: RecruiteeOffer, field: keyof RecruiteeTranslation): string | undefined {
  if (offer.translations?.en?.[field]) {
    return offer.translations.en[field];
  }

  for (const translation of Object.values(offer.translations ?? {})) {
    const value = translation[field];
    if (value?.trim()) {
      return value;
    }
  }

  return field === "title" ? offer.title : offer.description;
}

function buildRecruiteeLocation(offer: RecruiteeOffer): string {
  if (offer.location?.trim()) {
    return offer.location;
  }

  const parts = [offer.city, offer.country].filter((part): part is string => Boolean(part?.trim()));
  if (parts.length > 0) {
    return parts.join(", ");
  }

  return offer.remote ? "Remote" : "Unknown";
}

function inferRecruiteeRemoteStatus(offer: RecruiteeOffer): JobCandidate["remote_status"] {
  if (offer.remote) {
    return "remote";
  }
  if (offer.hybrid) {
    return "hybrid";
  }
  if (offer.on_site) {
    return "onsite";
  }
  return undefined;
}

export async function fetchRecruiteeJobs(source: SourceRecord, client: SafeFetchClient): Promise<JobCandidate[]> {
  const config = JSON.parse(source.config_json) as RecruiteeConfig;
  const subdomain = config.subdomain.trim().replace(/^https?:\/\//, "").replace(/\.recruitee\.com\/?$/, "");
  const baseUrl = `https://${subdomain}.recruitee.com`;
  const url = `${baseUrl}/api/offers/`;
  const response = await client.fetchText(url);
  if (response.notModified || !response.text) {
    return [];
  }

  const payload = JSON.parse(response.text) as RecruiteeResponse;

  return (payload.offers ?? [])
    .map((offer) => {
      const title = pickTranslatedField(offer, "title") ?? "";
      const description = normalizeDescriptionText(pickTranslatedField(offer, "description") ?? "");
      return {
        title,
        company: offer.company_name ?? source.name.replace(/ Recruitee$/, ""),
        location: buildRecruiteeLocation(offer),
        url: offer.careers_url ?? offer.careers_apply_url ?? "",
        source: "recruitee",
        date_posted: offer.created_at,
        description,
        remote_status: inferRecruiteeRemoteStatus(offer)
      };
    })
    .filter((job) => Boolean(job.title && job.url) && isTargetRole(job.title, job.description));
}
