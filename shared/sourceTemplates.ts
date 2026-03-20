import type { SourceRecord, SourceType } from "../worker/src/types.ts";

export type SourceTemplateValue = string | boolean;

export interface SourceTemplateField {
  key: string;
  label: string;
  kind: "text" | "url" | "csv" | "boolean";
  required?: boolean;
  placeholder?: string;
  defaultValue?: SourceTemplateValue;
  description?: string;
}

export interface SourceTemplate {
  type: SourceType;
  label: string;
  summary: string;
  fields: SourceTemplateField[];
}

export type SourceTemplateValues = Record<string, SourceTemplateValue | undefined>;

export interface ResolvedSourceRecord {
  id: string;
  type: SourceType;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
}

const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    type: "greenhouse",
    label: "Greenhouse",
    summary: "Public Greenhouse job board with department keyword filtering.",
    fields: [
      { key: "companyName", label: "Company name", kind: "text", required: true, placeholder: "Stripe" },
      { key: "boardToken", label: "Board token", kind: "text", required: true, placeholder: "stripe" },
      {
        key: "departmentKeywords",
        label: "Department keywords",
        kind: "csv",
        defaultValue: "product",
        description: "Comma-separated keywords used to keep the feed focused."
      }
    ]
  },
  {
    type: "lever",
    label: "Lever",
    summary: "Public Lever postings API with team keyword filtering.",
    fields: [
      { key: "companyName", label: "Company name", kind: "text", required: true, placeholder: "Netlify" },
      { key: "site", label: "Site slug", kind: "text", required: true, placeholder: "netlify" },
      {
        key: "teamKeywords",
        label: "Team keywords",
        kind: "csv",
        defaultValue: "product",
        description: "Comma-separated keywords matched against the public team label."
      }
    ]
  },
  {
    type: "ashby",
    label: "Ashby",
    summary: "Public Ashby posting API using an organization slug.",
    fields: [
      { key: "companyName", label: "Company name", kind: "text", required: true, placeholder: "OpenAI" },
      { key: "organizationSlug", label: "Organization slug", kind: "text", required: true, placeholder: "openai" }
    ]
  },
  {
    type: "recruitee",
    label: "Recruitee",
    summary: "Public Recruitee offers feed using the company subdomain.",
    fields: [
      { key: "companyName", label: "Company name", kind: "text", required: true, placeholder: "Publitas" },
      { key: "subdomain", label: "Subdomain", kind: "text", required: true, placeholder: "publitas" }
    ]
  },
  {
    type: "personio_xml",
    label: "Personio XML",
    summary: "Public Personio XML feed using the company slug and language.",
    fields: [
      { key: "companyName", label: "Company name", kind: "text", required: true, placeholder: "Ory" },
      { key: "companySlug", label: "Company slug", kind: "text", required: true, placeholder: "ory" },
      { key: "language", label: "Language", kind: "text", defaultValue: "en", placeholder: "en" }
    ]
  },
  {
    type: "remote_json",
    label: "JSON feed",
    summary: "Generic read-only JSON endpoint for feed-style job APIs.",
    fields: [
      { key: "sourceName", label: "Source name", kind: "text", required: true, placeholder: "Remotive" },
      { key: "url", label: "Feed URL", kind: "url", required: true, placeholder: "https://remotive.com/api/remote-jobs" },
      {
        key: "sourceLabel",
        label: "Source label",
        kind: "text",
        required: true,
        placeholder: "remotive",
        description: "Used for source IDs and job metadata labels."
      },
      {
        key: "assumeRemote",
        label: "Assume jobs are remote by default",
        kind: "boolean",
        defaultValue: false
      }
    ]
  }
];

function requiredString(values: SourceTemplateValues, key: string, label: string): string {
  const raw = values[key];
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
}

function optionalString(values: SourceTemplateValues, key: string, defaultValue = ""): string {
  const raw = values[key];
  if (typeof raw !== "string") {
    return defaultValue;
  }
  const trimmed = raw.trim();
  return trimmed || defaultValue;
}

function readBoolean(values: SourceTemplateValues, key: string, defaultValue = false): boolean {
  const raw = values[key];
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const lowered = raw.trim().toLowerCase();
    if (lowered === "true" || lowered === "1" || lowered === "yes") {
      return true;
    }
    if (lowered === "false" || lowered === "0" || lowered === "no") {
      return false;
    }
  }
  return defaultValue;
}

function parseCsv(raw: string, fallback: string[] = []): string[] {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : fallback;
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDomainSlug(raw: string, suffix: string): string {
  return normalizeSlug(raw).replace(new RegExp(`\\.${suffix.replace(/\./g, "\\.")}$`), "");
}

function baseRecord(type: SourceType, id: string, name: string, baseUrl: string, config: unknown): ResolvedSourceRecord {
  return {
    id,
    type,
    name,
    base_url: baseUrl,
    config_json: JSON.stringify(config),
    enabled: 1
  };
}

export function listSourceTemplates(): SourceTemplate[] {
  return SOURCE_TEMPLATES;
}

export function getSourceTemplate(type: string): SourceTemplate | null {
  return SOURCE_TEMPLATES.find((template) => template.type === type) ?? null;
}

export function buildSourceRecordFromTemplate(type: SourceType, values: SourceTemplateValues): ResolvedSourceRecord {
  switch (type) {
    case "greenhouse": {
      const companyName = requiredString(values, "companyName", "Company name");
      const boardToken = normalizeSlug(requiredString(values, "boardToken", "Board token"));
      const departmentKeywords = parseCsv(optionalString(values, "departmentKeywords", "product"), ["product"]);
      return baseRecord("greenhouse", `gh-${boardToken}`, `${companyName} Greenhouse`, "https://boards-api.greenhouse.io", {
        boardToken,
        departmentKeywords
      });
    }
    case "lever": {
      const companyName = requiredString(values, "companyName", "Company name");
      const site = normalizeSlug(requiredString(values, "site", "Site slug"));
      const teamKeywords = parseCsv(optionalString(values, "teamKeywords", "product"), ["product"]);
      return baseRecord("lever", `lever-${site}`, `${companyName} Lever`, "https://api.lever.co", {
        site,
        teamKeywords
      });
    }
    case "ashby": {
      const companyName = requiredString(values, "companyName", "Company name");
      const organizationSlug = normalizeSlug(requiredString(values, "organizationSlug", "Organization slug"));
      return baseRecord("ashby", `ashby-${organizationSlug}`, `${companyName} Ashby`, "https://api.ashbyhq.com", {
        organizationSlug
      });
    }
    case "recruitee": {
      const companyName = requiredString(values, "companyName", "Company name");
      const subdomain = normalizeDomainSlug(requiredString(values, "subdomain", "Subdomain"), "recruitee.com");
      return baseRecord("recruitee", `recruitee-${subdomain}`, `${companyName} Recruitee`, `https://${subdomain}.recruitee.com`, {
        subdomain
      });
    }
    case "personio_xml": {
      const companyName = requiredString(values, "companyName", "Company name");
      const companySlug = normalizeDomainSlug(requiredString(values, "companySlug", "Company slug"), "jobs.personio.de");
      const language = optionalString(values, "language", "en");
      return baseRecord(
        "personio_xml",
        `personio-${companySlug}`,
        `${companyName} Personio XML`,
        `https://${companySlug}.jobs.personio.de`,
        { companySlug, language }
      );
    }
    case "remote_json": {
      const sourceName = requiredString(values, "sourceName", "Source name");
      const url = requiredString(values, "url", "Feed URL");
      const parsed = new URL(url);
      const sourceLabel = normalizeSlug(requiredString(values, "sourceLabel", "Source label"));
      const assumeRemote = readBoolean(values, "assumeRemote", false);
      return baseRecord("remote_json", sourceLabel, sourceName, parsed.origin, {
        url,
        sourceLabel,
        assumeRemote
      });
    }
    default:
      throw new Error(`Unsupported source type: ${type}`);
  }
}

export function sourceRecordToTemplateValues(source: Pick<SourceRecord, "type" | "name" | "config_json" | "base_url">): SourceTemplateValues {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(source.config_json) as Record<string, unknown>;
  } catch {
    config = {};
  }

  switch (source.type) {
    case "greenhouse":
      return {
        companyName: source.name.replace(/ Greenhouse$/, ""),
        boardToken: typeof config.boardToken === "string" ? config.boardToken : "",
        departmentKeywords: Array.isArray(config.departmentKeywords) ? config.departmentKeywords.join(", ") : "product"
      };
    case "lever":
      return {
        companyName: source.name.replace(/ Lever$/, ""),
        site: typeof config.site === "string" ? config.site : "",
        teamKeywords: Array.isArray(config.teamKeywords) ? config.teamKeywords.join(", ") : "product"
      };
    case "ashby":
      return {
        companyName: source.name.replace(/ Ashby$/, ""),
        organizationSlug: typeof config.organizationSlug === "string" ? config.organizationSlug : ""
      };
    case "recruitee":
      return {
        companyName: source.name.replace(/ Recruitee$/, ""),
        subdomain: typeof config.subdomain === "string" ? config.subdomain : ""
      };
    case "personio_xml":
      return {
        companyName: source.name.replace(/ Personio XML$/, ""),
        companySlug: typeof config.companySlug === "string" ? config.companySlug : "",
        language: typeof config.language === "string" ? config.language : "en"
      };
    case "remote_json":
      return {
        sourceName: source.name,
        url: typeof config.url === "string" ? config.url : source.base_url,
        sourceLabel: typeof config.sourceLabel === "string" ? config.sourceLabel : source.name.toLowerCase(),
        assumeRemote: config.assumeRemote === true
      };
    default:
      return {};
  }
}
