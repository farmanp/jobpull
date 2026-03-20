import { useEffect, useId, useMemo, useState } from "react";
import {
  type BoardState,
  configToRulesDraft,
  getTemplateDefaults,
  readApiError,
  rulesDraftToConfigPatch,
  sourceToTemplateValues,
  type BoardConfig,
  type NotificationsInfo,
  type Pack,
  type RuntimeInfo,
  type RulesDraft,
  type Source,
  type SourcePreview,
  type SourceTemplate,
  type SourceTemplateValues,
  type Stats
} from "./admin";

type Props = {
  apiBase: string;
  onExitToJobs?: () => void;
};

type AdminSection = "overview" | "setup" | "sources" | "rules" | "crawl" | "notifications" | "deployment" | "advanced";

type AdvancedDraft = {
  boardName: string;
  tagline: string;
  contactEmail: string;
  remoteOnly: string;
  titleIncludePatterns: string;
  titleExcludePatterns: string;
  descriptionFallback: string;
  focusCategories: string;
  tagKeywords: string;
};

const SECTION_LABELS: Array<{ key: AdminSection; label: string; summary: string }> = [
  { key: "overview", label: "Overview", summary: "Board health, deployment status, and quick actions." },
  { key: "setup", label: "Setup", summary: "Guided first-run flow." },
  { key: "sources", label: "Sources", summary: "Connect, preview, and manage feeds." },
  { key: "rules", label: "Rules", summary: "Tune focus areas, board tags, and title targeting." },
  { key: "crawl", label: "Crawl", summary: "Manual runs and recent results." },
  { key: "notifications", label: "Notifications", summary: "Subscriber email delivery and send health." },
  { key: "deployment", label: "Deployment", summary: "What can change here vs outside the app." },
  { key: "advanced", label: "Advanced", summary: "Raw config editing for expert users." }
];

const SETUP_STEPS = [
  "Choose starter pack",
  "Connect sources",
  "Tune rules",
  "Review deployment",
  "Run first crawl"
] as const;

const SETUP_RULES_REVIEWED_KEY = "jobpull_setup_rules_reviewed";
const SETUP_DEPLOYMENT_REVIEWED_KEY = "jobpull_setup_deployment_reviewed";

async function adminFetch(
  apiBase: string,
  path: string,
  options: RequestInit = {}
) {
  return fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
}

async function adminJson<T>(
  apiBase: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await adminFetch(apiBase, path, options);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return (await response.json()) as T;
}

async function publicJson<T>(apiBase: string, path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include"
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return (await response.json()) as T;
}

function createAdvancedDraft(config: BoardConfig): AdvancedDraft {
  return {
    boardName: config.boardName,
    tagline: config.tagline,
    contactEmail: config.contactEmail,
    remoteOnly: String(config.remoteOnly),
    titleIncludePatterns: JSON.stringify(config.titleIncludePatterns, null, 2),
    titleExcludePatterns: JSON.stringify(config.titleExcludePatterns, null, 2),
    descriptionFallback: JSON.stringify(config.descriptionFallback, null, 2),
    focusCategories: JSON.stringify(config.focusCategories, null, 2),
    tagKeywords: JSON.stringify(config.tagKeywords, null, 2)
  };
}

function timeAgo(iso?: string): string {
  if (!iso) {
    return "not yet";
  }

  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SettingsPanel({ apiBase, onExitToJobs }: Props) {
  const idPrefix = useId().replaceAll(":", "-");
  const [loading, setLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  const [section, setSection] = useState<AdminSection>("overview");
  const [sectionInitialized, setSectionInitialized] = useState(false);
  const [setupStep, setSetupStep] = useState(0);

  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [templates, setTemplates] = useState<SourceTemplate[]>([]);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [boardState, setBoardState] = useState<BoardState | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<NotificationsInfo | null>(null);

  const [selectedPack, setSelectedPack] = useState<Pack["key"]>("product");
  const [packConfirmOpen, setPackConfirmOpen] = useState(false);
  const [packBusy, setPackBusy] = useState(false);
  const [packMessage, setPackMessage] = useState("");

  const [sourceType, setSourceType] = useState("");
  const [sourceValues, setSourceValues] = useState<SourceTemplateValues>({});
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourcePreview, setSourcePreview] = useState<SourcePreview | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceMessage, setSourceMessage] = useState("");

  const [rulesDraft, setRulesDraft] = useState<RulesDraft | null>(null);
  const [rulesMessage, setRulesMessage] = useState("");
  const [rulesBusy, setRulesBusy] = useState(false);
  const [includeKeywordInput, setIncludeKeywordInput] = useState("");
  const [excludeKeywordInput, setExcludeKeywordInput] = useState("");
  const [newFocusLabel, setNewFocusLabel] = useState("");
  const [newFocusKeywords, setNewFocusKeywords] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagKeywords, setNewTagKeywords] = useState("");

  const [advancedDraft, setAdvancedDraft] = useState<AdvancedDraft | null>(null);
  const [advancedBusy, setAdvancedBusy] = useState(false);
  const [advancedMessage, setAdvancedMessage] = useState("");

  const [scheduleDraft, setScheduleDraft] = useState("");
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState("");
  const [boardStateBusy, setBoardStateBusy] = useState(false);
  const [boardStateMessage, setBoardStateMessage] = useState("");

  const [crawlBusy, setCrawlBusy] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testEmailBusy, setTestEmailBusy] = useState(false);
  const [testEmailMessage, setTestEmailMessage] = useState("");
  const [rulesReviewed, setRulesReviewed] = useState(
    () => localStorage.getItem(SETUP_RULES_REVIEWED_KEY) === "true"
  );
  const [deploymentReviewed, setDeploymentReviewed] = useState(
    () => localStorage.getItem(SETUP_DEPLOYMENT_REVIEWED_KEY) === "true"
  );

  const currentTemplate = useMemo(
    () => templates.find((template) => template.type === sourceType) ?? null,
    [templates, sourceType]
  );
  const selectedPackDetails = useMemo(
    () => packs.find((pack) => pack.key === selectedPack) ?? null,
    [packs, selectedPack]
  );
  const configRulesDraft = useMemo(
    () => (config ? configToRulesDraft(config) : null),
    [config]
  );
  const rulesDirty = useMemo(() => {
    if (!rulesDraft || !configRulesDraft) {
      return false;
    }

    return JSON.stringify(rulesDraft) !== JSON.stringify(configRulesDraft);
  }, [configRulesDraft, rulesDraft]);

  async function loadAdminData(forceSection = false) {
    setLoading(true);
    setBootstrapError("");

    try {
      const [nextConfig, nextSources, nextPacks, nextTemplates, nextRuntime, nextBoardState, nextStats, nextNotifications] = await Promise.all([
        adminJson<BoardConfig>(apiBase, "/api/admin/config"),
        adminJson<{ sources: Source[] }>(apiBase, "/api/admin/sources"),
        adminJson<{ packs: Pack[] }>(apiBase, "/api/admin/packs"),
        adminJson<{ templates: SourceTemplate[] }>(apiBase, "/api/admin/source-templates"),
        adminJson<RuntimeInfo>(apiBase, "/api/admin/runtime"),
        adminJson<BoardState>(apiBase, "/api/admin/board-state"),
        publicJson<Stats>(apiBase, "/api/stats"),
        adminJson<NotificationsInfo>(apiBase, "/api/admin/notifications")
      ]);

      setConfig(nextConfig);
      setSources(nextSources.sources);
      setPacks(nextPacks.packs);
      setTemplates(nextTemplates.templates);
      setRuntime(nextRuntime);
      setBoardState(nextBoardState);
      setStats(nextStats);
      setNotifications(nextNotifications);
      setRulesDraft(configToRulesDraft(nextConfig));
      setAdvancedDraft(createAdvancedDraft(nextConfig));
      setScheduleDraft(nextRuntime.schedule);

      if (!selectedPack && nextPacks.packs[0]) {
        setSelectedPack(nextPacks.packs[0].key);
      }

      if (!sourceType && nextTemplates.templates[0]) {
        setSourceType(nextTemplates.templates[0].type);
        setSourceValues(getTemplateDefaults(nextTemplates.templates[0]));
      }

      if (!sectionInitialized || forceSection) {
        const needsSetup =
          nextSources.sources.length === 0 ||
          !nextRuntime.lastCrawl ||
          nextRuntime.lastCrawl.status !== "success";
        setSection(needsSetup ? "setup" : "overview");
        setSectionInitialized(true);
      }
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdminData();
  }, []);

  useEffect(() => {
    if (!currentTemplate || editingSourceId) {
      return;
    }
    setSourceValues(getTemplateDefaults(currentTemplate));
    setSourcePreview(null);
  }, [currentTemplate, editingSourceId]);

  useEffect(() => {
    setPackConfirmOpen(false);
  }, [selectedPack]);

  function fieldId(name: string) {
    return `${idPrefix}-${name}`;
  }

  function rememberSetupFlag(key: string, setter: (value: boolean) => void, value: boolean) {
    localStorage.setItem(key, value ? "true" : "false");
    setter(value);
  }

  function markRulesReviewed(value = true) {
    rememberSetupFlag(SETUP_RULES_REVIEWED_KEY, setRulesReviewed, value);
  }

  function markDeploymentReviewed(value = true) {
    rememberSetupFlag(SETUP_DEPLOYMENT_REVIEWED_KEY, setDeploymentReviewed, value);
  }

  function beginNewSource(nextType?: string) {
    const template = templates.find((item) => item.type === (nextType ?? sourceType));
    if (!template) {
      return;
    }

    setSourceType(template.type);
    setEditingSourceId(null);
    setSourcePreview(null);
    setSourceMessage("");
    setSourceValues(getTemplateDefaults(template));
  }

  function beginEditSource(source: Source) {
    setSection("sources");
    setEditingSourceId(source.id);
    setSourceType(source.type);
    setSourceValues(sourceToTemplateValues(source));
    setSourcePreview(null);
    setSourceMessage(`Editing ${source.name}. Validate again before saving changes.`);
  }

  async function applySelectedPack() {
    setPackBusy(true);
    setPackMessage("");
    try {
      const result = await adminJson<{ pack: { label: string } }>(apiBase, "/api/admin/packs/apply", {
        method: "POST",
        body: JSON.stringify({ pack: selectedPack })
      });
      markRulesReviewed(false);
      setPackMessage(`Applied ${result.pack.label}. You can review the created starter feeds in the next step.`);
      setPackConfirmOpen(false);
      await loadAdminData();
      setSetupStep(1);
    } catch (error) {
      setPackMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPackBusy(false);
    }
  }

  async function validateCurrentSource() {
    setSourceBusy(true);
    setSourceMessage("");
    try {
      const preview = await adminJson<SourcePreview>(apiBase, "/api/admin/sources/validate", {
        method: "POST",
        body: JSON.stringify({
          type: sourceType,
          values: sourceValues
        })
      });
      setSourcePreview(preview);
      setSourceMessage("Preview ready. Save this source if the jobs look correct.");
    } catch (error) {
      setSourcePreview(null);
      setSourceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceBusy(false);
    }
  }

  async function saveCurrentSource() {
    if (!sourcePreview) {
      setSourceMessage("Validate the source before saving it.");
      return;
    }

    if (editingSourceId && editingSourceId !== sourcePreview.source.id) {
      setSourceMessage("This edit would change the source ID. Remove and recreate the source to change slugs.");
      return;
    }

    setSourceBusy(true);
    setSourceMessage("");
    try {
      if (editingSourceId) {
        await adminJson(apiBase, `/api/admin/sources/${encodeURIComponent(editingSourceId)}`, {
          method: "PUT",
          body: JSON.stringify({
            name: sourcePreview.source.name,
            base_url: sourcePreview.source.base_url,
            config_json: sourcePreview.source.config_json,
            enabled: true
          })
        });
      } else {
        await adminJson(apiBase, "/api/admin/sources", {
          method: "POST",
          body: JSON.stringify(sourcePreview.source)
        });
      }

      setSourceMessage(`${sourcePreview.source.name} saved.`);
      await loadAdminData();
      beginNewSource(sourceType);
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceBusy(false);
    }
  }

  async function toggleSource(source: Source) {
    setSourceMessage("");
    try {
      await adminJson(apiBase, `/api/admin/sources/${encodeURIComponent(source.id)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: source.enabled ? false : true })
      });
      await loadAdminData();
      setSourceMessage(`${source.name} ${source.enabled ? "disabled" : "enabled"}.`);
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function deleteSource(source: Source) {
    if (
      !window.confirm(
        `Remove "${source.name}" from this board?\n\nThis deletes the saved source record and stops future crawls until you add it again.`
      )
    ) {
      return;
    }

    setSourceMessage("");
    try {
      await adminJson(apiBase, `/api/admin/sources/${encodeURIComponent(source.id)}`, {
        method: "DELETE"
      });
      await loadAdminData();
      if (editingSourceId === source.id) {
        beginNewSource(sourceType);
      }
      setSourceMessage(`${source.name} removed.`);
    } catch (error) {
      setSourceMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveRules() {
    if (!rulesDraft) {
      return;
    }

    setRulesBusy(true);
    setRulesMessage("");
    try {
      const updated = await adminJson<BoardConfig>(apiBase, "/api/admin/config", {
        method: "PUT",
        body: JSON.stringify(rulesDraftToConfigPatch(rulesDraft))
      });
      setConfig(updated);
      setRulesDraft(configToRulesDraft(updated));
      setAdvancedDraft(createAdvancedDraft(updated));
      markRulesReviewed(true);
      setRulesMessage("Rules saved. These targeting choices are now live.");
    } catch (error) {
      setRulesMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRulesBusy(false);
    }
  }

  async function saveAdvanced() {
    if (!advancedDraft) {
      return;
    }

    setAdvancedBusy(true);
    setAdvancedMessage("");
    try {
      const payload: Partial<BoardConfig> = {
        boardName: advancedDraft.boardName.trim(),
        tagline: advancedDraft.tagline.trim(),
        contactEmail: advancedDraft.contactEmail.trim(),
        remoteOnly: advancedDraft.remoteOnly === "true",
        titleIncludePatterns: JSON.parse(advancedDraft.titleIncludePatterns),
        titleExcludePatterns: JSON.parse(advancedDraft.titleExcludePatterns),
        descriptionFallback: JSON.parse(advancedDraft.descriptionFallback),
        focusCategories: JSON.parse(advancedDraft.focusCategories),
        tagKeywords: JSON.parse(advancedDraft.tagKeywords)
      };

      const updated = await adminJson<BoardConfig>(apiBase, "/api/admin/config", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setConfig(updated);
      setRulesDraft(configToRulesDraft(updated));
      setAdvancedDraft(createAdvancedDraft(updated));
      setAdvancedMessage("Advanced config saved.");
    } catch (error) {
      setAdvancedMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAdvancedBusy(false);
    }
  }

  async function saveRuntimeSchedule() {
    if (!runtime?.scheduleEditable) {
      return;
    }

    setRuntimeBusy(true);
    setRuntimeMessage("");
    try {
      const updated = await adminJson<RuntimeInfo>(apiBase, "/api/admin/runtime", {
        method: "PUT",
        body: JSON.stringify({ schedule: scheduleDraft })
      });
      setRuntime(updated);
      setScheduleDraft(updated.schedule);
      markDeploymentReviewed(true);
      setRuntimeMessage("Schedule updated. This deployment now uses the new crawl timing.");
    } catch (error) {
      setRuntimeMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function updateBoardVisibility(nextVisibility: "private" | "public") {
    setBoardStateBusy(true);
    setBoardStateMessage("");
    try {
      const updated = await adminJson<BoardState>(apiBase, "/api/admin/board-state", {
        method: "PUT",
        body: JSON.stringify({ visibility: nextVisibility })
      });
      setBoardState(updated);
      setBoardStateMessage(
        nextVisibility === "public"
          ? "This board is now public for readers."
          : "This board is private again. Only the owner can browse it now."
      );
    } catch (error) {
      setBoardStateMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBoardStateBusy(false);
    }
  }

  async function runCrawl() {
    setCrawlBusy(true);
    setCrawlMessage("");
    try {
      const result = await adminJson<{
        status: string;
        jobsAdded: number;
        errors: { message: string }[];
      }>(apiBase, "/api/admin/run-crawl", {
        method: "POST"
      });
      setCrawlMessage(
        `${result.status === "success" ? "Success" : "Completed"}: ${result.jobsAdded} jobs added${result.errors.length ? `, ${result.errors.length} errors` : ""}.`
      );
      await loadAdminData();
    } catch (error) {
      setCrawlMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCrawlBusy(false);
    }
  }

  async function sendTestNotification() {
    setTestEmailBusy(true);
    setTestEmailMessage("");
    try {
      const result = await adminJson<{ ok: true; message: string }>(
        apiBase,
        "/api/admin/notifications/test",
        {
          method: "POST",
          body: JSON.stringify({ email: testEmail })
        }
      );
      setTestEmailMessage(result.message);
      setTestEmail("");
      await loadAdminData();
    } catch (error) {
      setTestEmailMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTestEmailBusy(false);
    }
  }

  function updateSourceField(key: string, value: string | boolean) {
    setSourceValues((current) => ({ ...current, [key]: value }));
    setSourcePreview(null);
  }

  function addKeyword(kind: "include" | "exclude") {
    const value = (kind === "include" ? includeKeywordInput : excludeKeywordInput).trim();
    if (!value || !rulesDraft) {
      return;
    }

    if (kind === "include") {
      setRulesDraft({ ...rulesDraft, includeKeywords: [...rulesDraft.includeKeywords, value] });
      setIncludeKeywordInput("");
      return;
    }

    setRulesDraft({ ...rulesDraft, excludeKeywords: [...rulesDraft.excludeKeywords, value] });
    setExcludeKeywordInput("");
  }

  function removeKeyword(kind: "include" | "exclude", index: number) {
    if (!rulesDraft) {
      return;
    }

    if (kind === "include") {
      setRulesDraft({
        ...rulesDraft,
        includeKeywords: rulesDraft.includeKeywords.filter((_, itemIndex) => itemIndex !== index)
      });
      return;
    }

    setRulesDraft({
      ...rulesDraft,
      excludeKeywords: rulesDraft.excludeKeywords.filter((_, itemIndex) => itemIndex !== index)
    });
  }

  function addFocusCategory() {
    if (!rulesDraft || !newFocusLabel.trim() || !newFocusKeywords.trim()) {
      return;
    }

    setRulesDraft({
      ...rulesDraft,
      focusCategories: [
        ...rulesDraft.focusCategories,
        { label: newFocusLabel.trim(), keywords: newFocusKeywords.trim() }
      ]
    });
    setNewFocusLabel("");
    setNewFocusKeywords("");
  }

  function addTagKeyword() {
    if (!rulesDraft || !newTagLabel.trim() || !newTagKeywords.trim()) {
      return;
    }

    setRulesDraft({
      ...rulesDraft,
      tagKeywords: [
        ...rulesDraft.tagKeywords,
        { tag: newTagLabel.trim(), keywords: newTagKeywords.trim() }
      ]
    });
    setNewTagLabel("");
    setNewTagKeywords("");
  }

  if (loading && (!config || !runtime || !boardState || !stats || !notifications)) {
    return <p className="loading-text">Loading admin…</p>;
  }

  if (!config || !runtime || !boardState || !stats || !notifications || !rulesDraft || !advancedDraft) {
    return <p className="loading-text">Loading admin…</p>;
  }

  const enabledSources = sources.filter((source) => source.enabled === 1);
  const hasStarterPackApplied = sources.some((source) => source.id.startsWith("starter-"));
  const hasSavedSource = sources.length > 0;
  const setupChecklist = [
    {
      key: "pack",
      label: "Starter pack applied",
      note: hasStarterPackApplied
        ? "A managed starter bundle is already attached to this board."
        : "Pick a starter pack to preload targeting defaults and starter feeds.",
      done: hasStarterPackApplied
    },
    {
      key: "source",
      label: "At least one source saved",
      note: hasSavedSource
        ? `${sources.length} source${sources.length === 1 ? "" : "s"} saved to this board.`
        : "Validate and save at least one feed before the first crawl.",
      done: hasSavedSource
    },
    {
      key: "rules",
      label: "Rules reviewed",
      note: rulesDirty
        ? "You have unsaved rules changes. Save or confirm them before continuing."
        : rulesReviewed
          ? "Targeting rules have been reviewed in the app."
          : "Check the defaults so the board only keeps the roles you want.",
      done: rulesReviewed && !rulesDirty
    },
    {
      key: "deployment",
      label: "Deployment understood",
      note: deploymentReviewed
        ? "You already confirmed what can be changed here vs outside the app."
        : "Review whether schedule changes happen here or in deployment config.",
      done: deploymentReviewed
    },
    {
      key: "crawl",
      label: "First successful crawl",
      note: runtime.lastCrawl?.status === "success"
        ? `${stats.visibleJobs} visible jobs are live from the latest successful crawl.`
        : "Run the first crawl to activate the board and verify your setup.",
      done: runtime.lastCrawl?.status === "success"
    }
  ] as const;
  const completedSetupItems = setupChecklist.filter((item) => item.done).length;

  function renderSetupChecklist() {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>Setup progress</h3>
            <p>Move from blank install to a live board without leaving the app.</p>
          </div>
          <span className="admin-progress-pill">
            {completedSetupItems}/{setupChecklist.length} complete
          </span>
        </div>
        <div className="setup-checklist">
          {setupChecklist.map((item) => (
            <div key={item.key} className={`setup-check-item ${item.done ? "complete" : ""}`}>
              <span className="setup-check-icon" aria-hidden="true">
                {item.done ? "✓" : "•"}
              </span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderPackReview() {
    if (!selectedPackDetails) {
      return null;
    }

    return (
      <div className="admin-card admin-review-card">
        <div className="admin-card-header">
          <div>
            <h3>{selectedPackDetails.label} preview</h3>
            <p>This pack keeps branding and contact details, then swaps in role targeting defaults and managed starter feeds.</p>
          </div>
        </div>
        <div className="admin-grid admin-grid-2">
          <div className="admin-review-block">
            <span className="admin-review-label">What changes</span>
            <div className="admin-inline-list">
              <span>{selectedPackDetails.review.remoteOnly ? "Remote-only board" : "Mixed location board"}</span>
              <span>{selectedPackDetails.review.focusAreas.length} focus area{selectedPackDetails.review.focusAreas.length === 1 ? "" : "s"}</span>
              <span>{selectedPackDetails.review.boardTags.length} board tag{selectedPackDetails.review.boardTags.length === 1 ? "" : "s"}</span>
            </div>
            <p className="field-hint">{selectedPackDetails.review.tagline}</p>
          </div>
          <div className="admin-review-block">
            <span className="admin-review-label">Starter feeds to create or refresh</span>
            <div className="admin-inline-list">
              {selectedPackDetails.starterSources.map((source) => (
                <span key={source.id}>{source.name}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="admin-grid admin-grid-2">
          <div className="admin-review-block">
            <span className="admin-review-label">Focus areas</span>
            <div className="admin-inline-list">
              {selectedPackDetails.review.focusAreas.map((area) => (
                <span key={area}>{area}</span>
              ))}
            </div>
          </div>
          <div className="admin-review-block">
            <span className="admin-review-label">Board tags</span>
            <div className="admin-inline-list">
              {selectedPackDetails.review.boardTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="admin-inline-list">
          {selectedPackDetails.review.includeKeywords.map((keyword) => (
            <span key={`include-${keyword}`}>Keep: {keyword}</span>
          ))}
          {selectedPackDetails.review.excludeKeywords.map((keyword) => (
            <span key={`exclude-${keyword}`}>Skip: {keyword}</span>
          ))}
        </div>
      </div>
    );
  }

  function renderRulesSummary() {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>Rules summary</h3>
            <p>Review what the board will keep before you save or confirm these targeting rules.</p>
          </div>
        </div>
        <div className="admin-grid admin-grid-2">
          <div className="admin-review-block">
            <span className="admin-review-label">Board scope</span>
            <div className="admin-inline-list">
              <span>{rulesDraft.remoteOnly ? "Remote and hybrid only" : "All workplace types"}</span>
              <span>{rulesDraft.includeKeywords.length} title keywords to keep</span>
              <span>{rulesDraft.excludeKeywords.length} title keywords to skip</span>
            </div>
          </div>
          <div className="admin-review-block">
            <span className="admin-review-label">Current coverage</span>
            <div className="admin-inline-list">
              {rulesDraft.focusCategories.map((category) => (
                <span key={category.label}>{category.label}</span>
              ))}
              {rulesDraft.tagKeywords.map((tag) => (
                <span key={tag.tag}>#{tag.tag}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="field-hint">
          {rulesDirty
            ? "You have unsaved rule changes."
            : rulesReviewed
              ? "These rules have already been reviewed for this board."
              : "These rules are still using the last saved values until you confirm or save new changes."}
        </p>
      </div>
    );
  }

  function renderActivationCard() {
    if (runtime.lastCrawl?.status !== "success") {
      return null;
    }

    return (
      <div className="admin-card admin-activation-card">
        <div className="admin-card-header">
          <div>
            <h3>Board activated</h3>
            <p>Your first crawl finished. Review the live board or keep refining sources and rules from Admin.</p>
          </div>
        </div>
        <div className="admin-metrics">
          <div className="admin-metric">
            <span className="admin-metric-value">{stats.visibleJobs}</span>
            <span className="admin-metric-label">Visible jobs</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{stats.activeSources}</span>
            <span className="admin-metric-label">Active sources</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{runtime.lastCrawl.jobsAdded}</span>
            <span className="admin-metric-label">Jobs added in latest crawl</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{timeAgo(runtime.lastCrawl.finishedAt)}</span>
            <span className="admin-metric-label">Last successful crawl</span>
          </div>
        </div>
        <div className="admin-actions">
          {onExitToJobs && (
            <button className="btn-primary" onClick={onExitToJobs}>
              View live board
            </button>
          )}
          <button className="btn-secondary" onClick={() => setSection("overview")}>
            Go to overview
          </button>
        </div>
      </div>
    );
  }

  function renderSourceEditor() {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>{editingSourceId ? "Edit source" : "Add source"}</h3>
            <p>Use provider-specific forms, validate the live feed, then save the resolved source record.</p>
          </div>
          {editingSourceId && (
            <button className="btn-secondary" onClick={() => beginNewSource(sourceType)}>
              Cancel edit
            </button>
          )}
        </div>

        <div className="admin-field">
          <label htmlFor={fieldId("source-type")}>Source type</label>
          <select
            id={fieldId("source-type")}
            value={sourceType}
            onChange={(event) => beginNewSource(event.target.value)}
            disabled={Boolean(editingSourceId)}
          >
            {templates.map((template) => (
              <option key={template.type} value={template.type}>
                {template.label}
              </option>
            ))}
          </select>
          {currentTemplate && <p className="field-hint">{currentTemplate.summary}</p>}
        </div>

        {currentTemplate && (
          <div className="admin-source-fields">
            {currentTemplate.fields.map((field) => (
              <div key={field.key} className="admin-field">
                {field.kind !== "boolean" && (
                  <label htmlFor={fieldId(`source-${field.key}`)}>{field.label}</label>
                )}
                {field.kind === "boolean" ? (
                  <>
                    <label className="admin-checkbox" htmlFor={fieldId(`source-${field.key}`)}>
                      <input
                        id={fieldId(`source-${field.key}`)}
                        type="checkbox"
                        checked={sourceValues[field.key] === true}
                        onChange={(event) => updateSourceField(field.key, event.target.checked)}
                      />
                      <span>{field.label}</span>
                    </label>
                    {field.description && <p className="field-hint">{field.description}</p>}
                  </>
                ) : (
                  <input
                    id={fieldId(`source-${field.key}`)}
                    value={typeof sourceValues[field.key] === "string" ? sourceValues[field.key] as string : ""}
                    placeholder={field.placeholder}
                    onChange={(event) => updateSourceField(field.key, event.target.value)}
                  />
                )}
                {field.description && field.kind !== "boolean" && <p className="field-hint">{field.description}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="admin-actions">
          <button className="btn-secondary" onClick={validateCurrentSource} disabled={sourceBusy || !sourceType}>
            {sourceBusy ? "Validating…" : "Validate feed"}
          </button>
          <button className="btn-primary" onClick={saveCurrentSource} disabled={sourceBusy || !sourcePreview}>
            {editingSourceId ? "Save changes" : "Save source"}
          </button>
        </div>
        {sourceMessage && <p className="settings-message">{sourceMessage}</p>}

        {sourcePreview && (
          <div className="source-preview">
            <div className="source-preview-header">
              <strong>{sourcePreview.source.name}</strong>
              <span>{sourcePreview.source.id}</span>
            </div>
            <p className="field-hint">{sourcePreview.totalFetched} matching jobs fetched from the live endpoint.</p>
            {sourcePreview.warnings.length > 0 && (
              <div className="admin-inline-list admin-warning-list">
                {sourcePreview.warnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
              </div>
            )}
            <div className="source-preview-list">
              {sourcePreview.previewJobs.length > 0 ? (
                sourcePreview.previewJobs.map((job) => (
                  <a key={job.url} href={job.url} target="_blank" rel="noreferrer" className="source-preview-item">
                    <strong>{job.title}</strong>
                    <span>{job.company} · {job.location}</span>
                    <span>{titleCase(job.pm_focus)} · {job.remote_status}</span>
                  </a>
                ))
              ) : (
                <p className="field-hint">No preview jobs yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSourceTable() {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>Configured sources</h3>
            <p>Toggle sources for a crawl run, edit provider settings, or remove them entirely.</p>
          </div>
        </div>
        <table className="settings-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <strong>{source.name}</strong>
                  <span className="settings-source-id">{source.id}</span>
                </td>
                <td>
                  <span className="badge badge-focus">{source.type}</span>
                </td>
                <td>{source.enabled ? "Enabled" : "Disabled"}</td>
                <td className="admin-table-actions">
                  <button className="btn-secondary btn-secondary-sm" onClick={() => beginEditSource(source)}>
                    Edit
                  </button>
                  <button className="btn-secondary btn-secondary-sm" onClick={() => toggleSource(source)}>
                    {source.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="btn-danger-sm" onClick={() => deleteSource(source)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderRulesEditor() {
    return (
      <div className="admin-stack">
        {renderRulesSummary()}

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Board targeting</h3>
              <p>Start with keywords here. Regex-heavy tuning still lives in Advanced.</p>
            </div>
          </div>

          <div className="admin-grid admin-grid-2">
            <div className="admin-field">
              <label htmlFor={fieldId("rules-board-name")}>Board name</label>
              <input
                id={fieldId("rules-board-name")}
                value={rulesDraft.boardName}
                onChange={(event) => setRulesDraft({ ...rulesDraft, boardName: event.target.value })}
              />
            </div>
            <div className="admin-field">
              <label htmlFor={fieldId("rules-tagline")}>Tagline</label>
              <input
                id={fieldId("rules-tagline")}
                value={rulesDraft.tagline}
                onChange={(event) => setRulesDraft({ ...rulesDraft, tagline: event.target.value })}
              />
            </div>
          </div>

          <div className="admin-field">
            <label className="admin-checkbox">
              <input
                id={fieldId("rules-remote-only")}
                type="checkbox"
                checked={rulesDraft.remoteOnly}
                onChange={(event) => setRulesDraft({ ...rulesDraft, remoteOnly: event.target.checked })}
              />
              <span>Only keep remote and hybrid roles</span>
            </label>
          </div>

          <div className="admin-grid admin-grid-2">
            <div className="admin-field">
              <label htmlFor={fieldId("rules-include-keywords")}>Include title keywords</label>
              <div className="chip-input">
                {rulesDraft.includeKeywords.map((keyword, index) => (
                  <span key={`${keyword}-${index}`} className="chip chip-green">
                    {keyword}
                    <button aria-label={`Remove include keyword ${keyword}`} onClick={() => removeKeyword("include", index)}>×</button>
                  </span>
                ))}
                <input
                  id={fieldId("rules-include-keywords")}
                  aria-label="Add include keyword"
                  placeholder="Add keyword…"
                  value={includeKeywordInput}
                  onChange={(event) => setIncludeKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword("include");
                    }
                  }}
                />
              </div>
            </div>

            <div className="admin-field">
              <label htmlFor={fieldId("rules-exclude-keywords")}>Exclude title keywords</label>
              <div className="chip-input">
                {rulesDraft.excludeKeywords.map((keyword, index) => (
                  <span key={`${keyword}-${index}`} className="chip chip-red">
                    {keyword}
                    <button aria-label={`Remove exclude keyword ${keyword}`} onClick={() => removeKeyword("exclude", index)}>×</button>
                  </span>
                ))}
                <input
                  id={fieldId("rules-exclude-keywords")}
                  aria-label="Add exclude keyword"
                  placeholder="Add keyword…"
                  value={excludeKeywordInput}
                  onChange={(event) => setExcludeKeywordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addKeyword("exclude");
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Focus areas</h3>
              <p>Each focus area gets a label plus a comma-separated keyword list.</p>
            </div>
          </div>
          <div className="admin-list-grid">
            <div className="admin-list-head" aria-hidden="true">
              <span>Focus area</span>
              <span>Keywords</span>
              <span>Action</span>
            </div>
            {rulesDraft.focusCategories.map((category, index) => (
              <div key={`${category.label}-${index}`} className="admin-list-row admin-rule-row">
                <input
                  aria-label={`Focus area label ${index + 1}`}
                  value={category.label}
                  onChange={(event) =>
                    setRulesDraft({
                      ...rulesDraft,
                      focusCategories: rulesDraft.focusCategories.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item
                      )
                    })
                  }
                />
                <input
                  aria-label={`Focus area keywords ${index + 1}`}
                  value={category.keywords}
                  onChange={(event) =>
                    setRulesDraft({
                      ...rulesDraft,
                      focusCategories: rulesDraft.focusCategories.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, keywords: event.target.value } : item
                      )
                    })
                  }
                />
                <button
                  className="btn-danger-sm"
                  aria-label={`Remove focus area ${category.label}`}
                  onClick={() =>
                    setRulesDraft({
                      ...rulesDraft,
                      focusCategories: rulesDraft.focusCategories.filter((_, itemIndex) => itemIndex !== index)
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="admin-list-row admin-rule-row admin-list-row-new">
              <input
                aria-label="New focus area label"
                placeholder="New focus area"
                value={newFocusLabel}
                onChange={(event) => setNewFocusLabel(event.target.value)}
              />
              <input
                aria-label="New focus area keywords"
                placeholder="growth, activation, retention"
                value={newFocusKeywords}
                onChange={(event) => setNewFocusKeywords(event.target.value)}
              />
              <button className="btn-secondary btn-secondary-sm" onClick={addFocusCategory}>
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Board tags</h3>
              <p>These tags power niche filters and digest groupings without exposing regexes in the main UI.</p>
            </div>
          </div>
          <div className="admin-list-grid">
            <div className="admin-list-head" aria-hidden="true">
              <span>Tag</span>
              <span>Keywords</span>
              <span>Action</span>
            </div>
            {rulesDraft.tagKeywords.map((tag, index) => (
              <div key={`${tag.tag}-${index}`} className="admin-list-row admin-rule-row">
                <input
                  aria-label={`Board tag label ${index + 1}`}
                  value={tag.tag}
                  onChange={(event) =>
                    setRulesDraft({
                      ...rulesDraft,
                      tagKeywords: rulesDraft.tagKeywords.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, tag: event.target.value } : item
                      )
                    })
                  }
                />
                <input
                  aria-label={`Board tag keywords ${index + 1}`}
                  value={tag.keywords}
                  onChange={(event) =>
                    setRulesDraft({
                      ...rulesDraft,
                      tagKeywords: rulesDraft.tagKeywords.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, keywords: event.target.value } : item
                      )
                    })
                  }
                />
                <button
                  className="btn-danger-sm"
                  aria-label={`Remove board tag ${tag.tag}`}
                  onClick={() =>
                    setRulesDraft({
                      ...rulesDraft,
                      tagKeywords: rulesDraft.tagKeywords.filter((_, itemIndex) => itemIndex !== index)
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="admin-list-row admin-rule-row admin-list-row-new">
              <input
                aria-label="New board tag"
                placeholder="New board tag"
                value={newTagLabel}
                onChange={(event) => setNewTagLabel(event.target.value)}
              />
              <input
                aria-label="New board tag keywords"
                placeholder="remote, distributed, async"
                value={newTagKeywords}
                onChange={(event) => setNewTagKeywords(event.target.value)}
              />
              <button className="btn-secondary btn-secondary-sm" onClick={addTagKeyword}>
                Add
              </button>
            </div>
          </div>
          <div className="admin-actions">
            <button className="btn-primary" onClick={saveRules} disabled={rulesBusy}>
              {rulesBusy ? "Saving…" : "Save rules"}
            </button>
          </div>
          {rulesMessage && <p className="settings-message">{rulesMessage}</p>}
        </div>
      </div>
    );
  }

  function renderDeploymentCard(showActions = true) {
    const canEditSchedule = showActions && runtime.scheduleEditable;
    const deploymentChecks = [
      {
        key: "schedulerAvailable",
        label: "Scheduled crawls are available",
        good: "This runtime can run scheduled crawls.",
        warn: "Scheduling is not available from this runtime right now."
      },
      {
        key: "adminTokenConfigured",
        label: "Admin access is configured",
        good: "This deployment already has an admin token.",
        warn: "Add an admin token in deployment config before sharing admin access."
      },
      {
        key: "runtimeStorageAvailable",
        label: "Can save runtime settings",
        good: "This deployment can persist runtime-owned settings from the UI.",
        warn: "Runtime-owned settings must stay read-only in this environment."
      },
      {
        key: "databaseConnected",
        label: "Database is connected",
        good: "The app can reach the board database.",
        warn: "The app cannot verify the board database right now."
      }
    ] as const;

    return (
      <div className="admin-stack">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Runtime</h3>
              <p>
                {runtime.platform === "server"
                  ? "This deployment can change its schedule from the UI."
                  : "Cloudflare owns the schedule at deploy time. The UI is read-only here."}
              </p>
            </div>
          </div>
          <div className="admin-grid admin-grid-2">
            <div className="admin-field">
              <label htmlFor={fieldId("runtime-platform")}>Platform</label>
              <input id={fieldId("runtime-platform")} value={runtime.platform} readOnly />
            </div>
            <div className="admin-field">
              <label htmlFor={fieldId("runtime-stale-threshold")}>Stale threshold</label>
              <input id={fieldId("runtime-stale-threshold")} value={`${runtime.staleThresholdDays} days`} readOnly />
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor={fieldId("runtime-schedule")}>Current crawl schedule</label>
            <input id={fieldId("runtime-schedule")} value={runtime.schedule} readOnly />
            <p className="field-hint">
              {runtime.scheduleEditable
                ? "Schedule can be updated here because this runtime owns the crawler timer."
                : "Schedule must be changed in deployment config because Cloudflare owns the timer."}
            </p>
          </div>
          <div className="admin-inline-list">
            {runtime.editableFields.length > 0 ? (
              runtime.editableFields.map((field) => <span key={field}>Can change: {field}</span>)
            ) : (
              <span>No deployment settings can be changed here</span>
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Status checks</h3>
              <p>These checks reflect what the runtime can verify directly.</p>
            </div>
          </div>
          <div className="admin-check-grid">
            {deploymentChecks.map(({ key, label, good, warn }) => (
              <div key={key} className={`admin-check-card ${runtime.checks[key] ? "admin-check-good" : "admin-check-warn"}`}>
                <strong>{label}</strong>
                <span>{runtime.checks[key] ? good : warn}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Can change here</h3>
              <p>Only settings owned by this runtime can be changed from the app.</p>
            </div>
          </div>
          {canEditSchedule ? (
            <>
              <div className="admin-field">
                <label htmlFor={fieldId("runtime-schedule-edit")}>Schedule</label>
                <input
                  id={fieldId("runtime-schedule-edit")}
                  value={scheduleDraft}
                  onChange={(event) => setScheduleDraft(event.target.value)}
                />
                <p className="field-hint">Save a new cron value to update the in-process scheduler.</p>
              </div>
              <div className="admin-actions">
                <button className="btn-primary" onClick={saveRuntimeSchedule} disabled={runtimeBusy}>
                  {runtimeBusy ? "Saving…" : "Save schedule"}
                </button>
              </div>
            </>
          ) : (
            <div className="admin-copy-list">
              <div className="admin-copy-item">
                <span>No deployment settings are editable from this runtime.</span>
              </div>
            </div>
          )}
          {runtimeMessage && <p className="settings-message">{runtimeMessage}</p>}
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Change outside the app</h3>
              <p>The app does not manage secrets, bindings, domains, or provider-host settings.</p>
            </div>
          </div>
          <div className="admin-copy-list">
            {runtime.externalSteps.map((step) => (
              <div key={step} className="admin-copy-item">
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderNotificationsCard() {
    return (
      <div className="admin-stack">
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Email delivery</h3>
              <p>Public subscribers confirm by email, then receive the daily digest after successful scheduled crawls.</p>
            </div>
          </div>
          <div className="admin-check-grid">
            <div className={`admin-check-card ${notifications.provider.ready ? "admin-check-good" : "admin-check-warn"}`}>
              <strong>{notifications.provider.ready ? "Email delivery is ready" : "Email delivery is blocked"}</strong>
              <span>
                {notifications.provider.ready
                  ? `Resend is configured with ${notifications.provider.fromEmail ?? "a sender address"}.`
                  : "Finish the deployment-side email settings before public signup is enabled."}
              </span>
            </div>
            <div className="admin-check-card">
              <strong>Public signup URL</strong>
              <span>{notifications.publicSignupUrl ?? "Set PUBLIC_BASE_URL to expose the signup URL."}</span>
            </div>
          </div>
          {notifications.provider.issues.length > 0 && (
            <div className="admin-copy-list">
              {notifications.provider.issues.map((issue) => (
                <div key={issue} className="admin-copy-item">
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin-grid admin-grid-4">
          <div className="admin-stat-card">
            <strong>{notifications.subscribers.total}</strong>
            <span>Total subscribers</span>
          </div>
          <div className="admin-stat-card">
            <strong>{notifications.subscribers.active}</strong>
            <span>Active</span>
          </div>
          <div className="admin-stat-card">
            <strong>{notifications.subscribers.pending}</strong>
            <span>Pending confirm</span>
          </div>
          <div className="admin-stat-card">
            <strong>{notifications.subscribers.unsubscribed}</strong>
            <span>Unsubscribed</span>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Last delivery run</h3>
              <p>Track the latest digest or test send without exposing provider secrets in the UI.</p>
            </div>
          </div>
          {notifications.lastRun ? (
            <>
              <div className="admin-inline-list">
                <span>{notifications.lastRun.kind}</span>
                <span>{notifications.lastRun.status}</span>
                <span>{notifications.lastRun.recipientsSent}/{notifications.lastRun.recipientsTargeted} sent</span>
                <span>{notifications.lastRun.errorCount} errors</span>
              </div>
              <p className="field-hint">
                Started {timeAgo(notifications.lastRun.startedAt)}
                {notifications.lastRun.finishedAt ? ` · Finished ${timeAgo(notifications.lastRun.finishedAt)}` : ""}
              </p>
            </>
          ) : (
            <p className="field-hint">No notification runs yet.</p>
          )}
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Send a test digest</h3>
              <p>Use the latest digest window and current sender settings to verify the full delivery path.</p>
            </div>
          </div>
          <div className="admin-actions admin-actions-inline">
            <label className="sr-only" htmlFor={fieldId("notifications-test-email")}>Test email address</label>
            <input
              id={fieldId("notifications-test-email")}
              className="admin-inline-input"
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <button
              className="btn-primary"
              onClick={sendTestNotification}
              disabled={testEmailBusy || !testEmail.trim()}
            >
              {testEmailBusy ? "Sending…" : "Send test digest"}
            </button>
          </div>
          {testEmailMessage && <p className="settings-message">{testEmailMessage}</p>}
        </div>
      </div>
    );
  }

  function renderCrawlCard(showFinishAction = false) {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>Crawl controls</h3>
            <p>Manual runs stay available even when the schedule is managed outside the app.</p>
          </div>
        </div>
        <div className="admin-metrics">
          <div className="admin-metric">
            <span className="admin-metric-value">{stats.visibleJobs}</span>
            <span className="admin-metric-label">Visible jobs</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{stats.activeSources}</span>
            <span className="admin-metric-label">Active sources</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{stats.staleJobs}</span>
            <span className="admin-metric-label">Stale hidden</span>
          </div>
          <div className="admin-metric">
            <span className="admin-metric-value">{runtime.lastCrawl ? timeAgo(runtime.lastCrawl.finishedAt) : "Never"}</span>
            <span className="admin-metric-label">Last crawl</span>
          </div>
        </div>
        {runtime.lastCrawl && (
          <div className="admin-inline-list">
            <span>Status: {runtime.lastCrawl.status}</span>
            <span>Jobs added: {runtime.lastCrawl.jobsAdded}</span>
          </div>
        )}
        <div className="admin-actions">
          <button className="btn-primary" onClick={runCrawl} disabled={crawlBusy}>
            {crawlBusy ? "Running crawl…" : "Run crawl now"}
          </button>
          {showFinishAction && runtime.lastCrawl?.status === "success" && (
            <button className="btn-secondary" onClick={() => setSection("overview")}>
              Finish setup
            </button>
          )}
        </div>
        {crawlMessage && <p className="settings-message">{crawlMessage}</p>}
      </div>
    );
  }

  function renderSetupWizard() {
    const canContinueSources = hasSavedSource;

    return (
      <div className="admin-stack">
        {renderSetupChecklist()}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Guided setup</h3>
              <p>Choose a niche, connect real feeds, confirm targeting, review deployment limits, then activate the board.</p>
            </div>
          </div>
          <div className="setup-stepper">
            {SETUP_STEPS.map((label, index) => (
              <button
                key={label}
                className={`setup-step ${setupStep === index ? "active" : ""} ${setupStep > index ? "complete" : ""}`}
                onClick={() => setSetupStep(index)}
              >
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
        </div>

        {setupStep === 0 && (
          <>
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3>Choose starter pack</h3>
                  <p>Pick the closest niche so jobpull can preload sensible targeting defaults and starter feeds.</p>
                </div>
              </div>
              <div className="pack-grid">
                {packs.map((pack) => (
                  <button
                    key={pack.key}
                    className={`pack-card ${selectedPack === pack.key ? "selected" : ""}`}
                    onClick={() => setSelectedPack(pack.key)}
                  >
                    <strong>{pack.label}</strong>
                    <p>{pack.summary}</p>
                    <div className="admin-inline-list">
                      {pack.starterSources.map((source) => (
                        <span key={source.id}>{source.name}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {renderPackReview()}
            <div className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h3>Confirm pack changes</h3>
                  <p>Applying a pack replaces targeting defaults and upserts managed starter sources, but keeps your branding and contact info.</p>
                </div>
              </div>
              {!packConfirmOpen ? (
                <div className="admin-actions">
                  <button className="btn-primary" onClick={() => setPackConfirmOpen(true)}>
                    Review and continue
                  </button>
                </div>
              ) : (
                <div className="admin-confirmation">
                  <p>
                    The <strong>{selectedPackDetails?.label}</strong> pack will become this board&apos;s starting point.
                    You can still edit sources and rules in the next steps.
                  </p>
                  <div className="admin-actions">
                    <button className="btn-secondary" onClick={() => setPackConfirmOpen(false)}>
                      Go back
                    </button>
                    <button className="btn-primary" onClick={applySelectedPack} disabled={packBusy}>
                      {packBusy ? "Applying…" : "Apply this pack"}
                    </button>
                  </div>
                </div>
              )}
              {packMessage && <p className="settings-message">{packMessage}</p>}
            </div>
          </>
        )}

        {setupStep === 1 && (
          <>
            {renderSourceEditor()}
            {renderSourceTable()}
            <p className="settings-message">
              {canContinueSources
                ? "At least one validated source is saved. Continue when you are happy with the feed mix."
                : "Validate and save at least one source before continuing."}
            </p>
            <div className="admin-actions">
              <button className="btn-secondary" onClick={() => setSetupStep(0)}>
                Back
              </button>
              <button className="btn-primary" onClick={() => setSetupStep(2)} disabled={!canContinueSources}>
                Continue to rules
              </button>
            </div>
          </>
        )}

        {setupStep === 2 && (
          <>
            {renderRulesEditor()}
            <p className="settings-message">
              {rulesDirty
                ? "Save your rules changes before continuing."
                : rulesReviewed
                  ? "Rules confirmed. Continue when you are ready."
                  : "Confirm these rules so the first crawl uses the targeting you expect."}
            </p>
            <div className="admin-actions">
              <button className="btn-secondary" onClick={() => setSetupStep(1)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  markRulesReviewed(true);
                  setSetupStep(3);
                }}
                disabled={rulesDirty}
              >
                {rulesReviewed ? "Continue to deployment" : "Confirm rules and continue"}
              </button>
            </div>
          </>
        )}

        {setupStep === 3 && (
          <>
            {renderDeploymentCard(true)}
            <p className="settings-message">
              {runtime.scheduleEditable
                ? "This deployment can update its schedule here."
                : "This deployment can run crawls here, but schedule changes stay in deployment config."}
            </p>
            <div className="admin-actions">
              <button className="btn-secondary" onClick={() => setSetupStep(2)}>
                Back
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  markDeploymentReviewed(true);
                  setSetupStep(4);
                }}
              >
                {deploymentReviewed ? "Continue to first crawl" : "I understand. Continue"}
              </button>
            </div>
          </>
        )}

        {setupStep === 4 && (
          <>
            {renderActivationCard()}
            {renderCrawlCard(false)}
            <div className="admin-actions">
              <button className="btn-secondary" onClick={() => setSetupStep(3)}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderOverview() {
    return (
      <div className="admin-stack">
        {renderSetupChecklist()}
        <div className="admin-grid admin-grid-4">
          <div className="admin-stat-card">
            <strong>{stats.visibleJobs}</strong>
            <span>Visible jobs</span>
          </div>
          <div className="admin-stat-card">
            <strong>{stats.activeSources}</strong>
            <span>Active sources</span>
          </div>
          <div className="admin-stat-card">
            <strong>{stats.staleJobs}</strong>
            <span>Stale hidden</span>
          </div>
          <div className="admin-stat-card">
            <strong>{runtime.lastCrawl ? timeAgo(runtime.lastCrawl.finishedAt) : "Never"}</strong>
            <span>Last crawl</span>
          </div>
        </div>

        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Quick actions</h3>
              <p>Use setup for first-run activation or jump straight to sources, deployment, and crawl controls.</p>
            </div>
          </div>
          <div className="admin-actions">
            <button className="btn-primary" onClick={() => setSection("setup")}>Open setup wizard</button>
            <button className="btn-secondary" onClick={() => setSection("sources")}>Manage sources</button>
            <button className="btn-secondary" onClick={() => setSection("notifications")}>Open notifications</button>
            <button className="btn-secondary" onClick={() => setSection("deployment")}>Open deployment</button>
            <button className="btn-secondary" onClick={() => setSection("crawl")}>Open crawl controls</button>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Board visibility</h3>
              <p>Start private while you tune the board, then publish it later when you want readers to browse it.</p>
            </div>
          </div>
          <div className="admin-inline-list">
            <span>Current mode: {boardState.visibility}</span>
            {boardState.published_at && <span>Published {timeAgo(boardState.published_at)}</span>}
          </div>
          <div className="admin-actions">
            <button
              className="btn-primary"
              onClick={() => updateBoardVisibility(boardState.visibility === "public" ? "private" : "public")}
              disabled={boardStateBusy}
            >
              {boardStateBusy
                ? "Saving…"
                : boardState.visibility === "public"
                  ? "Make board private"
                  : "Publish board"}
            </button>
          </div>
          {boardStateMessage && <p className="settings-message">{boardStateMessage}</p>}
        </div>
        {runtime.lastCrawl?.status === "success" && renderActivationCard()}
      </div>
    );
  }

  function renderAdvanced() {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h3>Advanced config</h3>
            <p>Expert mode for raw config editing. Invalid JSON here can break targeting, so keep changes tight.</p>
          </div>
        </div>
        <div className="admin-grid admin-grid-2">
          <div className="admin-field">
            <label htmlFor={fieldId("advanced-board-name")}>Board name</label>
            <input
              id={fieldId("advanced-board-name")}
              value={advancedDraft.boardName}
              onChange={(event) => setAdvancedDraft({ ...advancedDraft, boardName: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor={fieldId("advanced-tagline")}>Tagline</label>
            <input
              id={fieldId("advanced-tagline")}
              value={advancedDraft.tagline}
              onChange={(event) => setAdvancedDraft({ ...advancedDraft, tagline: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor={fieldId("advanced-contact-email")}>Contact email</label>
            <input
              id={fieldId("advanced-contact-email")}
              value={advancedDraft.contactEmail}
              onChange={(event) => setAdvancedDraft({ ...advancedDraft, contactEmail: event.target.value })}
            />
          </div>
          <div className="admin-field">
            <label htmlFor={fieldId("advanced-remote-only")}>Remote only</label>
            <select
              id={fieldId("advanced-remote-only")}
              value={advancedDraft.remoteOnly}
              onChange={(event) => setAdvancedDraft({ ...advancedDraft, remoteOnly: event.target.value })}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
        </div>
        {(
          [
            ["titleIncludePatterns", "Title include patterns"],
            ["titleExcludePatterns", "Title exclude patterns"],
            ["descriptionFallback", "Description fallback"],
            ["focusCategories", "Focus areas"],
            ["tagKeywords", "Tag keywords"]
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="admin-field">
            <label htmlFor={fieldId(`advanced-${key}`)}>{label}</label>
            <textarea
              id={fieldId(`advanced-${key}`)}
              value={advancedDraft[key]}
              onChange={(event) => setAdvancedDraft({ ...advancedDraft, [key]: event.target.value })}
              rows={key === "descriptionFallback" ? 6 : 8}
            />
          </div>
        ))}
        <div className="admin-actions">
          <button className="btn-primary" onClick={saveAdvanced} disabled={advancedBusy}>
            {advancedBusy ? "Saving…" : "Save advanced config"}
          </button>
        </div>
        {advancedMessage && <p className="settings-message">{advancedMessage}</p>}
      </div>
    );
  }

  function renderSection() {
    switch (section) {
      case "overview":
        return renderOverview();
      case "setup":
        return renderSetupWizard();
      case "sources":
        return (
          <div className="admin-stack">
            {renderSourceEditor()}
            {renderSourceTable()}
          </div>
        );
      case "rules":
        return renderRulesEditor();
      case "crawl":
        return (
          <div className="admin-stack">
            {renderCrawlCard(false)}
          </div>
        );
      case "notifications":
        return renderNotificationsCard();
      case "deployment":
        return renderDeploymentCard(true);
      case "advanced":
        return renderAdvanced();
      default:
        return null;
    }
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head">
          <div className="admin-sidebar-kicker">Admin</div>
          <h2>Set up your board</h2>
          <p>Use this workspace to choose a niche, connect feeds, tune rules, and activate crawls. Secrets and deployment wiring stay outside the app.</p>
        </div>

        <nav className="admin-nav">
          {SECTION_LABELS.map((item) => (
            <button
              key={item.key}
              className={`admin-nav-item ${section === item.key ? "active" : ""}`}
              onClick={() => {
                setSection(item.key);
                setSectionInitialized(true);
              }}
            >
              <strong>{item.label}</strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <button
            className="btn-secondary btn-secondary-full"
            onClick={() => {
              setSectionInitialized(false);
              void loadAdminData(true);
            }}
          >
            Refresh admin
          </button>
        </div>
      </aside>

      <section className="admin-main">
        <div className="admin-main-head">
          <div>
            <h2>{SECTION_LABELS.find((item) => item.key === section)?.label ?? "Admin"}</h2>
            <p>{SECTION_LABELS.find((item) => item.key === section)?.summary ?? ""}</p>
          </div>
          {loading && <span className="admin-loading-pill">Refreshing…</span>}
        </div>

        {bootstrapError && <p className="settings-message settings-error-message">{bootstrapError}</p>}
        {renderSection()}
      </section>
    </div>
  );
}
