import {
  DEFAULT_CONFIG,
  type BoardConfig,
  type FocusCategory,
  type PatternRule,
  type TagKeyword
} from "../worker/src/config.ts";

export type PackName = "product" | "engineering" | "design" | "gtm";

export interface StarterSourceSeed {
  id: string;
  type: "remote_json";
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
}

interface ProviderRecommendation {
  type: string;
  description: string;
}

export interface RolePack {
  key: PackName;
  label: string;
  summary: string;
  config: Pick<
    BoardConfig,
    | "tagline"
    | "remoteOnly"
    | "titleIncludePatterns"
    | "titleExcludePatterns"
    | "descriptionFallback"
    | "focusCategories"
    | "tagKeywords"
  >;
  providerRecommendations: ProviderRecommendation[];
}

function keywordsPattern(label: string, values: string[]): PatternRule {
  return {
    label,
    source: `\\b(${values.join("|")})\\b`
  };
}

function focus(label: string, source: string): FocusCategory {
  return { label, source };
}

function tag(tagName: string, source: string): TagKeyword {
  return { tag: tagName, source };
}

const PACKS: Record<PackName, RolePack> = {
  product: {
    key: "product",
    label: "Product",
    summary: "Remote-first product management roles with PM-specific focus areas and public remote-job starters.",
    config: {
      tagline: DEFAULT_CONFIG.tagline,
      remoteOnly: true,
      titleIncludePatterns: DEFAULT_CONFIG.titleIncludePatterns,
      titleExcludePatterns: DEFAULT_CONFIG.titleExcludePatterns,
      descriptionFallback: DEFAULT_CONFIG.descriptionFallback,
      focusCategories: DEFAULT_CONFIG.focusCategories,
      tagKeywords: DEFAULT_CONFIG.tagKeywords
    },
    providerRecommendations: [
      { type: "greenhouse", description: "Add company-specific boards with product department keywords." },
      { type: "lever", description: "Add teams labeled product or platform for targeted PM coverage." },
      { type: "ashby", description: "Use public Ashby organizations with PM or leadership postings." },
      { type: "recruitee", description: "Good for remote-friendly startup and SaaS PM listings." },
      { type: "personio_xml", description: "Useful when you want Europe-heavy public career feeds." }
    ]
  },
  engineering: {
    key: "engineering",
    label: "Engineering",
    summary: "Remote engineering roles with functional focus areas like frontend, backend, infra, and data.",
    config: {
      tagline: "Remote-first engineering roles, updated daily",
      remoteOnly: true,
      titleIncludePatterns: [
        keywordsPattern("Engineering titles", [
          "software engineer",
          "staff engineer",
          "principal engineer",
          "frontend engineer",
          "backend engineer",
          "fullstack engineer",
          "full stack engineer",
          "mobile engineer",
          "ios engineer",
          "android engineer",
          "platform engineer",
          "devops engineer",
          "site reliability engineer",
          "sre",
          "data engineer",
          "machine learning engineer",
          "engineering manager"
        ])
      ],
      titleExcludePatterns: [
        keywordsPattern("Non-engineering lookalikes", [
          "sales engineer",
          "solutions engineer",
          "support engineer",
          "qa engineer",
          "test engineer",
          "security officer",
          "recruiter"
        ])
      ],
      descriptionFallback: null,
      focusCategories: [
        focus("frontend", "frontend|react|vue|angular|ui"),
        focus("backend", "backend|api|services|distributed systems"),
        focus("infrastructure", "infra|platform|devops|sre|kubernetes|terraform"),
        focus("data", "data engineer|etl|warehouse|analytics"),
        focus("ml", "machine learning|ml|ai|llm")
      ],
      tagKeywords: [
        tag("remote", "\\bremote\\b|distributed"),
        tag("typescript", "\\btypescript\\b|\\bts\\b"),
        tag("python", "\\bpython\\b"),
        tag("go", "\\bgolang\\b|\\bgo\\b"),
        tag("ai", "\\bai\\b|machine learning|llm"),
        tag("fintech", "fintech|payments|banking"),
        tag("healthcare", "healthcare|health tech|medtech"),
        tag("saas", "saas|software as a service")
      ]
    },
    providerRecommendations: [
      { type: "greenhouse", description: "Use engineering department keywords or platform-specific teams." },
      { type: "lever", description: "Add engineering, infrastructure, data, or ML teams from public postings." },
      { type: "ashby", description: "Strong fit for startup and AI engineering organizations." },
      { type: "recruitee", description: "Useful for remote SaaS and EU engineering teams." },
      { type: "personio_xml", description: "Useful for Europe-focused engineering hiring pages." }
    ]
  },
  design: {
    key: "design",
    label: "Design",
    summary: "Remote design roles focused on product design, UX, research, and systems work.",
    config: {
      tagline: "Remote-first design roles, updated daily",
      remoteOnly: true,
      titleIncludePatterns: [
        keywordsPattern("Design titles", [
          "product designer",
          "ux designer",
          "ui designer",
          "design lead",
          "design manager",
          "head of design",
          "principal designer",
          "visual designer",
          "brand designer",
          "ux researcher",
          "design systems"
        ])
      ],
      titleExcludePatterns: [
        keywordsPattern("Non-product design roles", [
          "graphic designer",
          "interior designer",
          "fashion designer",
          "architect"
        ])
      ],
      descriptionFallback: null,
      focusCategories: [
        focus("product", "product design|ux|ui"),
        focus("research", "research|usability|insights"),
        focus("systems", "design systems|component library"),
        focus("brand", "brand|visual|marketing design")
      ],
      tagKeywords: [
        tag("remote", "\\bremote\\b|distributed"),
        tag("figma", "\\bfigma\\b"),
        tag("research", "research|interviews|usability"),
        tag("design-systems", "design systems|component library"),
        tag("b2b", "\\bb2b\\b|enterprise"),
        tag("b2c", "\\bb2c\\b|consumer"),
        tag("saas", "saas|software as a service")
      ]
    },
    providerRecommendations: [
      { type: "greenhouse", description: "Filter on design departments or product-design teams." },
      { type: "lever", description: "Add design or research teams from public Lever sites." },
      { type: "ashby", description: "Good fit for public startup and product-design job boards." },
      { type: "recruitee", description: "Useful for design-heavy SaaS and agency hiring pages." },
      { type: "personio_xml", description: "Useful when targeting Europe-based design openings." }
    ]
  },
  gtm: {
    key: "gtm",
    label: "GTM",
    summary: "Remote go-to-market roles across sales, marketing, success, and revenue operations.",
    config: {
      tagline: "Remote-first go-to-market roles, updated daily",
      remoteOnly: true,
      titleIncludePatterns: [
        keywordsPattern("GTM titles", [
          "account executive",
          "sales manager",
          "sales director",
          "business development",
          "sales development representative",
          "demand generation",
          "growth marketer",
          "product marketing manager",
          "customer success manager",
          "revenue operations",
          "partnerships manager",
          "lifecycle marketer",
          "field marketing"
        ])
      ],
      titleExcludePatterns: [
        keywordsPattern("Non-GTM roles", [
          "sales engineer",
          "solutions engineer",
          "recruiter",
          "office manager",
          "project manager"
        ])
      ],
      descriptionFallback: null,
      focusCategories: [
        focus("sales", "sales|account executive|account manager|pipeline"),
        focus("marketing", "marketing|demand gen|campaigns|growth"),
        focus("success", "customer success|onboarding|retention"),
        focus("revops", "revenue operations|sales operations|gtm systems")
      ],
      tagKeywords: [
        tag("remote", "\\bremote\\b|distributed"),
        tag("b2b", "\\bb2b\\b|enterprise"),
        tag("b2c", "\\bb2c\\b|consumer"),
        tag("saas", "saas|software as a service"),
        tag("ai", "\\bai\\b|machine learning|llm"),
        tag("fintech", "fintech|payments|banking")
      ]
    },
    providerRecommendations: [
      { type: "greenhouse", description: "Use sales, marketing, growth, or customer-success departments." },
      { type: "lever", description: "Add GTM teams like revenue, sales, marketing, and customer success." },
      { type: "ashby", description: "Good fit for startup sales and growth orgs using Ashby." },
      { type: "recruitee", description: "Useful for remote SaaS GTM teams, especially in Europe." },
      { type: "personio_xml", description: "Useful for Europe-heavy GTM hiring pages." }
    ]
  }
};

const STARTER_SOURCE_BASES = {
  remoteok: "https://remoteok.com",
  remotive: "https://remotive.com",
  arbeitnow: "https://www.arbeitnow.com",
  workingnomads: "https://www.workingnomads.com"
} as const;

const WORKING_NOMADS_QUERY_BY_PACK: Record<PackName, string> = {
  product: "title:product",
  engineering: "title:engineer",
  design: "title:design",
  gtm: "title:sales"
};

export function listRolePacks(): RolePack[] {
  return Object.values(PACKS);
}

export function getRolePack(packName: string): RolePack | null {
  if (!(packName in PACKS)) {
    return null;
  }

  return PACKS[packName as PackName];
}

export function buildPackConfigPatch(packName: PackName): Partial<BoardConfig> {
  return { ...PACKS[packName].config };
}

export function buildPackStarterSources(packName: PackName): StarterSourceSeed[] {
  const pack = PACKS[packName];
  return [
    {
      id: "starter-remoteok",
      type: "remote_json",
      name: `RemoteOK ${pack.label}`,
      base_url: STARTER_SOURCE_BASES.remoteok,
      config_json: JSON.stringify({
        url: "https://remoteok.com/api",
        sourceLabel: "remoteok"
      }),
      enabled: 1
    },
    {
      id: "starter-remotive",
      type: "remote_json",
      name: `Remotive ${pack.label}`,
      base_url: STARTER_SOURCE_BASES.remotive,
      config_json: JSON.stringify({
        url: "https://remotive.com/api/remote-jobs",
        sourceLabel: "remotive"
      }),
      enabled: 1
    },
    {
      id: "starter-arbeitnow",
      type: "remote_json",
      name: `Arbeitnow ${pack.label}`,
      base_url: STARTER_SOURCE_BASES.arbeitnow,
      config_json: JSON.stringify({
        url: "https://www.arbeitnow.com/api/job-board-api",
        sourceLabel: "arbeitnow"
      }),
      enabled: 1
    },
    {
      id: "starter-workingnomads",
      type: "remote_json",
      name: `Working Nomads ${pack.label}`,
      base_url: STARTER_SOURCE_BASES.workingnomads,
      config_json: JSON.stringify({
        url: `https://www.workingnomads.com/jobsapi/_search?q=${encodeURIComponent(WORKING_NOMADS_QUERY_BY_PACK[packName])}&size=250`,
        sourceLabel: "workingnomads",
        assumeRemote: true
      }),
      enabled: 1
    }
  ];
}

function sqlValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildPackSeedSql(packName: PackName, boardName: string, contactEmail: string): string {
  const configEntries = Object.entries({
    boardName,
    contactEmail,
    ...buildPackConfigPatch(packName)
  }).map(([key, value]) => {
    const serialized = typeof value === "string" ? value : typeof value === "boolean" ? String(value) : JSON.stringify(value);
    return `INSERT OR REPLACE INTO board_config (key, value) VALUES (${sqlValue(key)}, ${sqlValue(serialized)});`;
  });

  const sourceRows = buildPackStarterSources(packName)
    .map(
      (source) =>
        `  (${sqlValue(source.id)}, ${sqlValue(source.type)}, ${sqlValue(source.name)}, ${sqlValue(source.base_url)}, ${sqlValue(source.config_json)}, ${source.enabled})`
    )
    .join(",\n");

  return [
    ...configEntries,
    "INSERT OR REPLACE INTO sources (id, type, name, base_url, config_json, enabled) VALUES",
    `${sourceRows};`
  ].join("\n");
}
