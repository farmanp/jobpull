import { useEffect, useState } from "react";

type BoardConfig = {
  boardName: string;
  tagline: string;
  contactEmail: string;
  remoteOnly: boolean;
  titleIncludePatterns: { label: string; source: string }[];
  titleExcludePatterns: { label: string; source: string }[];
  focusCategories: { label: string; source: string }[];
  tagKeywords: { tag: string; source: string }[];
};

type Source = {
  id: string;
  type: string;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
};

type Props = {
  apiBase: string;
};

async function adminFetch(
  apiBase: string,
  token: string,
  path: string,
  options: RequestInit = {}
) {
  return fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

export function SettingsPanel({ apiBase }: Props) {
  const [token, setToken] = useState(() => localStorage.getItem("job_pull_token") ?? "");
  const [authed, setAuthed] = useState(false);
  const [config, setConfig] = useState<BoardConfig | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState("");

  // -- Auth --
  function handleAuth() {
    localStorage.setItem("job_pull_token", token);
    setAuthed(false);
    adminFetch(apiBase, token, "/api/admin/config")
      .then((r) => {
        if (r.ok) {
          setAuthed(true);
          return r.json();
        }
        throw new Error("Invalid token");
      })
      .then((data) => setConfig(data as BoardConfig))
      .catch(() => setMessage("❌ Invalid admin token"));
  }

  // -- Load data on auth --
  useEffect(() => {
    if (!authed) return;
    adminFetch(apiBase, token, "/api/admin/sources")
      .then((r) => r.json())
      .then((d) => setSources((d as { sources: Source[] }).sources))
      .catch(() => {});
  }, [authed]);

  // -- Save config --
  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setMessage("");
    const resp = await adminFetch(apiBase, token, "/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    if (resp.ok) {
      const updated = (await resp.json()) as BoardConfig;
      setConfig(updated);
      setMessage("✅ Config saved!");
    } else {
      const err = await resp.text();
      setMessage(`❌ Save failed: ${err}`);
    }
    setSaving(false);
  }

  // -- Toggle source --
  async function toggleSource(id: string, enabled: boolean) {
    await adminFetch(apiBase, token, `/api/admin/sources/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: enabled ? 1 : 0 } : s))
    );
  }

  // -- Delete source --
  async function deleteSource(id: string) {
    if (!window.confirm(`Remove source "${id}"?`)) return;
    await adminFetch(apiBase, token, `/api/admin/sources/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  // -- Run crawl --
  async function runCrawl() {
    setCrawling(true);
    setCrawlResult("");
    const resp = await adminFetch(apiBase, token, "/api/admin/run-crawl", {
      method: "POST",
    });
    if (resp.ok) {
      const r = (await resp.json()) as {
        status: string;
        jobsAdded: number;
        errors: { message: string }[];
      };
      setCrawlResult(
        `${r.status === "success" ? "✅" : "⚠️"} ${r.status.toUpperCase()} — ${r.jobsAdded} jobs added${r.errors.length > 0 ? ` (${r.errors.length} errors)` : ""}`
      );
    } else {
      setCrawlResult("❌ Crawl failed");
    }
    setCrawling(false);
  }

  // -- helpers --
  function updateConfig<K extends keyof BoardConfig>(key: K, value: BoardConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function addChip(
    key: "titleIncludePatterns" | "titleExcludePatterns",
    value: string
  ) {
    if (!config || !value.trim()) return;
    const existing = config[key];
    const source = `\\b${value.trim().toLowerCase()}\\b`;
    updateConfig(key, [...existing, { label: value.trim(), source }]);
  }

  function removeChip(key: "titleIncludePatterns" | "titleExcludePatterns", idx: number) {
    if (!config) return;
    updateConfig(
      key,
      config[key].filter((_, i) => i !== idx)
    );
  }

  function addFocus(label: string) {
    if (!config || !label.trim()) return;
    updateConfig("focusCategories", [
      ...config.focusCategories,
      { label: label.trim().toLowerCase(), source: label.trim().toLowerCase() },
    ]);
  }

  function removeFocus(idx: number) {
    if (!config) return;
    updateConfig(
      "focusCategories",
      config.focusCategories.filter((_, i) => i !== idx)
    );
  }

  // -- Login screen --
  if (!authed) {
    return (
      <div className="settings-auth">
        <div className="settings-auth-card">
          <h2>🔐 Admin Access</h2>
          <p>Enter your admin token to manage this board.</p>
          <div className="settings-auth-form">
            <input
              type="password"
              placeholder="Admin token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAuth()}
            />
            <button className="btn-primary" onClick={handleAuth}>
              Authenticate
            </button>
          </div>
          {message && <p className="settings-message">{message}</p>}
        </div>
      </div>
    );
  }

  if (!config) return <p className="loading-text">Loading config…</p>;

  // -- Settings UI --
  return (
    <div className="settings-panel">
      {/* Branding */}
      <section className="settings-section">
        <h3>Board Branding</h3>
        <div className="settings-field">
          <label>Board name</label>
          <input
            value={config.boardName}
            onChange={(e) => updateConfig("boardName", e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>Tagline</label>
          <input
            value={config.tagline}
            onChange={(e) => updateConfig("tagline", e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label>Contact email</label>
          <input
            value={config.contactEmail}
            onChange={(e) => updateConfig("contactEmail", e.target.value)}
          />
        </div>
        <div className="settings-field settings-toggle-field">
          <label>Remote only</label>
          <button
            className={`settings-toggle ${config.remoteOnly ? "on" : "off"}`}
            onClick={() => updateConfig("remoteOnly", !config.remoteOnly)}
          >
            {config.remoteOnly ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      {/* Role Targeting */}
      <section className="settings-section">
        <h3>Role Targeting</h3>
        <div className="settings-field">
          <label>Include roles with these keywords</label>
          <div className="chip-input">
            {config.titleIncludePatterns.map((p, i) => (
              <span key={i} className="chip chip-green">
                {p.label}
                <button onClick={() => removeChip("titleIncludePatterns", i)}>×</button>
              </span>
            ))}
            <input
              placeholder="Add keyword…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addChip("titleIncludePatterns", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        </div>
        <div className="settings-field">
          <label>Exclude roles with these keywords</label>
          <div className="chip-input">
            {config.titleExcludePatterns.map((p, i) => (
              <span key={i} className="chip chip-red">
                {p.label}
                <button onClick={() => removeChip("titleExcludePatterns", i)}>×</button>
              </span>
            ))}
            <input
              placeholder="Add keyword…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addChip("titleExcludePatterns", (e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Focus Categories */}
      <section className="settings-section">
        <h3>Focus Categories</h3>
        <div className="chip-input">
          {config.focusCategories.map((c, i) => (
            <span key={i} className="chip chip-default">
              {c.label}
              <button onClick={() => removeFocus(i)}>×</button>
            </span>
          ))}
          <input
            placeholder="Add category…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addFocus((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
      </section>

      {/* Save */}
      <div className="settings-actions">
        <button className="btn-primary" onClick={saveConfig} disabled={saving}>
          {saving ? "Saving…" : "Save Config"}
        </button>
        {message && <span className="settings-message">{message}</span>}
      </div>

      {/* Sources */}
      <section className="settings-section">
        <h3>Job Sources</h3>
        <table className="settings-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Enabled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <span className="settings-source-id">{s.id}</span>
                </td>
                <td>
                  <span className="badge badge-focus">{s.type}</span>
                </td>
                <td>
                  <button
                    className={`settings-toggle ${s.enabled ? "on" : "off"}`}
                    onClick={() => toggleSource(s.id, !s.enabled)}
                  >
                    {s.enabled ? "ON" : "OFF"}
                  </button>
                </td>
                <td>
                  <button className="btn-danger-sm" onClick={() => deleteSource(s.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Crawl */}
      <section className="settings-section">
        <h3>Crawl Controls</h3>
        <button className="btn-primary" onClick={runCrawl} disabled={crawling}>
          {crawling ? "Crawling…" : "🕷️ Run Crawl Now"}
        </button>
        {crawlResult && <p className="settings-message" style={{ marginTop: 12 }}>{crawlResult}</p>}
      </section>
    </div>
  );
}
