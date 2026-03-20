export type BoardConfig = {
  boardName: string;
  tagline: string;
  contactEmail: string;
  remoteOnly: boolean;
  titleIncludePatterns: { label: string; source: string }[];
  titleExcludePatterns: { label: string; source: string }[];
  descriptionFallback: {
    titlePattern: string;
    descriptionInclude: string;
    descriptionExclude: string;
  } | null;
  focusCategories: { label: string; source: string }[];
  tagKeywords: { tag: string; source: string }[];
};

export type Source = {
  id: string;
  type: string;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
};

export type SourceTemplate = {
  type: string;
  label: string;
  summary: string;
  fields: Array<{
    key: string;
    label: string;
    kind: "text" | "url" | "csv" | "boolean";
    required?: boolean;
    placeholder?: string;
    defaultValue?: string | boolean;
    description?: string;
  }>;
};

export type Pack = {
  key: "product" | "engineering" | "design" | "gtm";
  label: string;
  summary: string;
  providerRecommendations: Array<{ type: string; description: string }>;
  starterSources: Array<{ id: string; type: string; name: string }>;
  review: {
    tagline: string;
    remoteOnly: boolean;
    includeKeywords: string[];
    excludeKeywords: string[];
    focusAreas: string[];
    boardTags: string[];
  };
};

export type RuntimeInfo = {
  platform: "cloudflare" | "server";
  schedule: string;
  scheduleEditable: boolean;
  staleThresholdDays: number;
  lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
  editableFields: string[];
  checks: {
    schedulerAvailable: boolean;
    adminTokenConfigured: boolean;
    runtimeStorageAvailable: boolean;
    databaseConnected: boolean;
  };
  externalSteps: string[];
};

export type BoardState = {
  id: string;
  owner_user_id: string | null;
  visibility: "private" | "public";
  claimed_at: string | null;
  published_at: string | null;
};

export type NotificationsInfo = {
  provider: {
    ready: boolean;
    service: "resend";
    fromEmail: string | null;
    replyToEmail: string | null;
    publicBaseUrl: string | null;
    issues: string[];
  };
  subscribers: {
    total: number;
    pending: number;
    active: number;
    unsubscribed: number;
  };
  lastRun: null | {
    id: string;
    kind: "digest" | "test";
    status: "running" | "sent" | "partial" | "failed" | "skipped";
    recipientsTargeted: number;
    recipientsSent: number;
    startedAt: string;
    finishedAt: string | null;
    errorCount: number;
    crawlRunId: string | null;
  };
  publicSignupUrl: string | null;
};

export type Stats = {
  totalJobs: number;
  visibleJobs: number;
  staleJobs: number;
  activeSources: number;
  staleThresholdDays: number;
  lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
};

export type SourceTemplateValues = Record<string, string | boolean | undefined>;

export type SourcePreview = {
  source: Source;
  totalFetched: number;
  warnings: string[];
  previewJobs: Array<{
    title: string;
    company: string;
    location: string;
    source: string;
    remote_status: string;
    pm_focus: string;
    url: string;
    tags: string[];
    date_posted?: string;
  }>;
};

export type RulesDraft = {
  boardName: string;
  tagline: string;
  remoteOnly: boolean;
  includeKeywords: string[];
  excludeKeywords: string[];
  focusCategories: Array<{ label: string; keywords: string }>;
  tagKeywords: Array<{ tag: string; keywords: string }>;
};

export function escapeRegexTerm(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanupPatternSource(source: string): string {
  return source
    .replace(/^\\b\(/, "")
    .replace(/\)\\b$/, "")
    .replace(/^\\b/, "")
    .replace(/\\b$/, "");
}

export function patternSourceToKeywords(source: string): string[] {
  const cleaned = cleanupPatternSource(source);
  if (!cleaned) {
    return [];
  }

  return cleaned
    .split("|")
    .map((part) => part.replace(/\\b/g, "").trim())
    .filter(Boolean);
}

export function keywordsToPatternSource(keywords: string[]): string {
  const values = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => escapeRegexTerm(keyword.toLowerCase()));

  if (values.length === 0) {
    return "";
  }

  return `\\b(${values.join("|")})\\b`;
}

export function configToRulesDraft(config: BoardConfig): RulesDraft {
  return {
    boardName: config.boardName,
    tagline: config.tagline,
    remoteOnly: config.remoteOnly,
    includeKeywords: config.titleIncludePatterns.flatMap((rule) => patternSourceToKeywords(rule.source)),
    excludeKeywords: config.titleExcludePatterns.flatMap((rule) => patternSourceToKeywords(rule.source)),
    focusCategories: config.focusCategories.map((category) => ({
      label: category.label,
      keywords: patternSourceToKeywords(category.source).join(", ") || category.source
    })),
    tagKeywords: config.tagKeywords.map((tag) => ({
      tag: tag.tag,
      keywords: patternSourceToKeywords(tag.source).join(", ") || tag.source
    }))
  };
}

export function rulesDraftToConfigPatch(draft: RulesDraft): Partial<BoardConfig> {
  const includeSource = keywordsToPatternSource(draft.includeKeywords);
  const excludeSource = keywordsToPatternSource(draft.excludeKeywords);

  return {
    boardName: draft.boardName.trim(),
    tagline: draft.tagline.trim(),
    remoteOnly: draft.remoteOnly,
    titleIncludePatterns: includeSource
      ? [{ label: "Include keywords", source: includeSource }]
      : [],
    titleExcludePatterns: excludeSource
      ? [{ label: "Exclude keywords", source: excludeSource }]
      : [],
    focusCategories: draft.focusCategories
      .map((category) => ({
        label: category.label.trim().toLowerCase(),
        source: keywordsToPatternSource(
          category.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean)
        )
      }))
      .filter((category) => category.label && category.source),
    tagKeywords: draft.tagKeywords
      .map((tag) => ({
        tag: tag.tag.trim().toLowerCase(),
        source: keywordsToPatternSource(
          tag.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean)
        )
      }))
      .filter((tag) => tag.tag && tag.source)
  };
}

export function getTemplateDefaults(template: SourceTemplate): SourceTemplateValues {
  return Object.fromEntries(
    template.fields.map((field) => [field.key, field.defaultValue ?? (field.kind === "boolean" ? false : "")])
  );
}

export function sourceToTemplateValues(source: Source): SourceTemplateValues {
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
        sourceLabel: typeof config.sourceLabel === "string" ? config.sourceLabel : source.id,
        assumeRemote: config.assumeRemote === true
      };
    default:
      return {};
  }
}

export async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { error?: string; details?: string[] };
    if (payload.details?.length) {
      return `${payload.error ?? "Request failed"}: ${payload.details.join(", ")}`;
    }
    return payload.error ?? `Request failed: ${response.status}`;
  }

  const text = await response.text();
  return text || `Request failed: ${response.status}`;
}
