/**
 * Board configuration — the single place to customize what your job board
 * searches for, how it classifies roles, and what it tags.
 *
 * Config is loaded at runtime from D1 (`board_config` table), falling back
 * to DEFAULT_CONFIG for any missing keys.  Both the CLI and Admin UI
 * write to the same table.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * A pattern rule used for title/description matching.
 * `source` is the regex source string so that config can be serialized.
 */
export interface PatternRule {
  /** Human-readable label (e.g. "Product Manager titles") */
  label: string;
  /** RegExp source string — will be compiled with the `i` flag */
  source: string;
}

export interface FocusCategory {
  /** Display label (e.g. "Growth") */
  label: string;
  /** RegExp source string — matched against `title + description` */
  source: string;
}

export interface TagKeyword {
  /** Tag name (e.g. "ai", "fintech") */
  tag: string;
  /** RegExp source string — matched against `title + description + location` */
  source: string;
}

export interface BoardConfig {
  /* --- Branding --------------------------------------------------- */
  /** Board display name shown in the UI header */
  boardName: string;
  /** Short tagline / description for SEO and header subtitle */
  tagline: string;
  /** Contact email shown in the crawler User-Agent string */
  contactEmail: string;

  /* --- Role Classification ---------------------------------------- */
  /** Regex patterns — if a title matches ANY, the role is included */
  titleIncludePatterns: PatternRule[];
  /** Regex patterns — if a title matches ANY, the role is excluded (takes priority) */
  titleExcludePatterns: PatternRule[];
  /**
   * Fallback check: when a title doesn't match include/exclude, look for
   * these patterns in the description to decide inclusion.
   * Set to `null` to disable the fallback.
   */
  descriptionFallback: {
    /** Title must match this pattern */
    titlePattern: string;
    /** Description must match this pattern */
    descriptionInclude: string;
    /** Description must NOT match this pattern */
    descriptionExclude: string;
  } | null;

  /* --- Remote Filtering ------------------------------------------- */
  /** Only keep remote & hybrid roles? Set false to keep all */
  remoteOnly: boolean;

  /* --- Focus Categories ------------------------------------------- */
  /** Custom focus categories (like PM sub-disciplines, or eng specialties) */
  focusCategories: FocusCategory[];

  /* --- Auto-Tagging ----------------------------------------------- */
  /** Keywords to auto-tag jobs with (industry, tech, etc.) */
  tagKeywords: TagKeyword[];
}

/* ------------------------------------------------------------------ */
/*  Default Config — Remote Product Management Roles                   */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONFIG: BoardConfig = {
  boardName: "Remote PM Jobs",
  tagline: "Remote-first Product Management roles, updated daily",
  contactEmail: "you@example.com",

  titleIncludePatterns: [
    {
      label: "Product Manager titles",
      source:
        "\\b(product manager|group product manager|principal product manager|staff product manager|senior product manager|associate product manager|technical product manager|platform product manager|growth product manager|head of product|director of product|vp product|vice president,? product|chief product officer|product owner)\\b",
    },
  ],

  titleExcludePatterns: [
    {
      label: "Non-PM roles with similar keywords",
      source:
        "\\b(project manager|program manager|product marketing|product designer|product design|product analyst|data product manager|engineering manager|software engineer|sales|account manager|customer success)\\b",
    },
  ],

  descriptionFallback: {
    titlePattern: "\\bpm\\b",
    descriptionInclude: "\\bproduct\\b",
    descriptionExclude: "\\bproject\\b",
  },

  remoteOnly: true,

  focusCategories: [
    { label: "growth", source: "growth|acquisition|retention|activation" },
    { label: "platform", source: "platform|infrastructure|api" },
    { label: "technical", source: "technical|developer|engineering" },
    { label: "core", source: "core product|product experience|consumer product" },
  ],

  tagKeywords: [
    { tag: "remote", source: "\\bremote\\b|distributed" },
    { tag: "b2b", source: "\\bb2b\\b|enterprise" },
    { tag: "b2c", source: "\\bb2c\\b|consumer" },
    { tag: "ai", source: "\\bai\\b|machine learning|llm|artificial intelligence" },
    { tag: "fintech", source: "fintech|payments|banking" },
    { tag: "healthcare", source: "healthcare|health tech|medtech" },
    { tag: "saas", source: "saas|software as a service" },
    { tag: "marketplace", source: "marketplace|two-sided" },
    { tag: "data", source: "data platform|analytics|bi " },
  ],
};

/* ------------------------------------------------------------------ */
/*  DB-backed config loading                                           */
/* ------------------------------------------------------------------ */

/** Keys in the board_config table that hold JSON arrays/objects */
const JSON_KEYS = new Set([
  "titleIncludePatterns",
  "titleExcludePatterns",
  "descriptionFallback",
  "focusCategories",
  "tagKeywords",
]);

/** Keys that hold booleans */
const BOOLEAN_KEYS = new Set(["remoteOnly"]);

/**
 * Read the board_config table and merge with DEFAULT_CONFIG.
 * Missing keys fall back to defaults — so the board works even with
 * a completely empty table.
 */
export async function loadConfigFromDB(db: D1Database): Promise<BoardConfig> {
  try {
    const result = await db
      .prepare("SELECT key, value FROM board_config")
      .all<{ key: string; value: string }>();

    const rows = result.results ?? [];
    if (rows.length === 0) {
      return { ...DEFAULT_CONFIG };
    }

    const overrides: Record<string, unknown> = {};
    for (const { key, value } of rows) {
      if (JSON_KEYS.has(key)) {
        try {
          overrides[key] = JSON.parse(value);
        } catch {
          // skip malformed JSON — fall back to default
        }
      } else if (BOOLEAN_KEYS.has(key)) {
        overrides[key] = value === "true";
      } else {
        overrides[key] = value;
      }
    }

    return { ...DEFAULT_CONFIG, ...overrides } as BoardConfig;
  } catch {
    // Table may not exist yet (pre-migration) — return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write a partial BoardConfig to the board_config table.
 * Only the provided keys are written — others are left unchanged.
 */
export async function saveConfigToDB(
  db: D1Database,
  partial: Partial<BoardConfig>
): Promise<BoardConfig> {
  const stmts: D1PreparedStatement[] = [];

  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue;

    const serialized = JSON_KEYS.has(key)
      ? JSON.stringify(value)
      : BOOLEAN_KEYS.has(key)
        ? String(value)
        : String(value);

    stmts.push(
      db
        .prepare(
          "INSERT OR REPLACE INTO board_config (key, value) VALUES (?, ?)"
        )
        .bind(key, serialized)
    );
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return loadConfigFromDB(db);
}

/**
 * Validate a partial config object — returns an array of error strings.
 * Empty array means valid.
 */
export function validatePartialConfig(partial: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const validKeys = new Set(Object.keys(DEFAULT_CONFIG));

  for (const key of Object.keys(partial)) {
    if (!validKeys.has(key)) {
      errors.push(`Unknown config key: "${key}"`);
    }
  }

  if (partial.boardName !== undefined && typeof partial.boardName !== "string") {
    errors.push("boardName must be a string");
  }
  if (partial.tagline !== undefined && typeof partial.tagline !== "string") {
    errors.push("tagline must be a string");
  }
  if (partial.remoteOnly !== undefined && typeof partial.remoteOnly !== "boolean") {
    errors.push("remoteOnly must be a boolean");
  }
  if (partial.titleIncludePatterns !== undefined && !Array.isArray(partial.titleIncludePatterns)) {
    errors.push("titleIncludePatterns must be an array");
  }
  if (partial.titleExcludePatterns !== undefined && !Array.isArray(partial.titleExcludePatterns)) {
    errors.push("titleExcludePatterns must be an array");
  }
  if (partial.focusCategories !== undefined && !Array.isArray(partial.focusCategories)) {
    errors.push("focusCategories must be an array");
  }
  if (partial.tagKeywords !== undefined && !Array.isArray(partial.tagKeywords)) {
    errors.push("tagKeywords must be an array");
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/*  In-memory config (hot path for classify.ts)                        */
/* ------------------------------------------------------------------ */

let _active: BoardConfig = DEFAULT_CONFIG;

/** Replace the active config (called per-request after DB load) */
export function setActiveConfig(config: BoardConfig): void {
  _active = config;
}

/** Get the current board config */
export function getConfig(): BoardConfig {
  return _active;
}
