/**
 * `jobpull sources` — interactive source management
 */

import {
  BOLD, RESET, GREEN, CYAN, DIM, RED, YELLOW,
  ask, confirm, ensureToken, adminFetch, success, fail, warn
} from "./helpers.ts";
import {
  buildSourceRecordFromTemplate,
  getSourceTemplate,
  listSourceTemplates,
  type SourceTemplateValues
} from "../../shared/sourceTemplates.ts";

type Source = {
  id: string;
  type: string;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
};

function printSourceTable(sources: Source[]) {
  console.log(`\n  ${BOLD}${"ID".padEnd(20)} ${"Name".padEnd(30)} ${"Type".padEnd(15)} Status${RESET}`);
  console.log(`  ${"─".repeat(20)} ${"─".repeat(30)} ${"─".repeat(15)} ${"─".repeat(10)}`);
  for (const s of sources) {
    const status = s.enabled ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`;
    console.log(`  ${s.id.padEnd(20)} ${s.name.padEnd(30)} ${s.type.padEnd(15)} ${status}`);
  }
  console.log("");
}

export async function runSources(apiBase: string, token: string) {
  token = await ensureToken(token);

  console.log(`\n${BOLD}📡 jobpull — Source Management${RESET}`);
  console.log(`${DIM}Manage which job boards your crawler pulls from${RESET}\n`);

  // Fetch sources
  const resp = await adminFetch(apiBase, token, "/api/admin/sources");
  if (!resp.ok) {
    fail(`Could not fetch sources: ${resp.status}`);
    process.exit(1);
  }

  const { sources } = (await resp.json()) as { sources: Source[] };
  printSourceTable(sources);

  // Action menu
  while (true) {
    console.log(`${BOLD}Actions:${RESET}`);
    console.log(`  ${CYAN}1${RESET} Add a new source`);
    console.log(`  ${CYAN}2${RESET} Toggle a source (enable/disable)`);
    console.log(`  ${CYAN}3${RESET} Remove a source`);
    console.log(`  ${CYAN}q${RESET} Quit`);

    const choice = await ask("\nChoice");

    if (choice === "q" || choice === "Q" || !choice) break;

    if (choice === "1") {
      await addSource(apiBase, token);
    } else if (choice === "2") {
      await toggleSource(apiBase, token, sources);
    } else if (choice === "3") {
      await removeSource(apiBase, token, sources);
    }

    // Refresh
    const refreshResp = await adminFetch(apiBase, token, "/api/admin/sources");
    if (refreshResp.ok) {
      const refreshed = (await refreshResp.json()) as { sources: Source[] };
      sources.length = 0;
      sources.push(...refreshed.sources);
      printSourceTable(sources);
    }
  }
}

async function addSource(apiBase: string, token: string) {
  console.log(`\n${BOLD}Add a new source${RESET}\n`);

  const supportedTypes = listSourceTemplates().map((template) => template.type).join(" / ");
  const type = await ask(
    `Source type (${supportedTypes})`,
    "greenhouse"
  );
  const template = getSourceTemplate(type);
  if (!template) {
    fail("Invalid source type");
    return;
  }

  const values: SourceTemplateValues = {};
  for (const field of template.fields) {
    if (field.kind === "boolean") {
      values[field.key] = await confirm(
        `${field.label}${field.description ? ` — ${field.description}` : ""}`,
        field.defaultValue === true
      );
      continue;
    }

    values[field.key] = await ask(
      `${field.label}${field.description ? ` — ${field.description}` : ""}`,
      typeof field.defaultValue === "string" ? field.defaultValue : undefined
    );
  }

  let resolved;
  try {
    resolved = buildSourceRecordFromTemplate(template.type, values);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const resp = await adminFetch(apiBase, token, "/api/admin/sources", {
    method: "POST",
    body: JSON.stringify(resolved),
  });

  if (resp.ok) {
    success(`Added source: ${resolved.name} (${resolved.id})`);
  } else {
    const err = await resp.text();
    fail(`Failed to add source: ${err}`);
  }
}

async function toggleSource(apiBase: string, token: string, sources: Source[]) {
  const id = await ask("Source ID to toggle");
  const source = sources.find((s) => s.id === id);
  if (!source) { fail(`Source "${id}" not found`); return; }

  const newEnabled = !source.enabled;
  const resp = await adminFetch(apiBase, token, `/api/admin/sources/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled: newEnabled }),
  });

  if (resp.ok) {
    success(`${id} → ${newEnabled ? "enabled" : "disabled"}`);
  } else {
    fail(`Failed to toggle: ${await resp.text()}`);
  }
}

async function removeSource(apiBase: string, token: string, sources: Source[]) {
  const id = await ask("Source ID to remove");
  const source = sources.find((s) => s.id === id);
  if (!source) { fail(`Source "${id}" not found`); return; }

  const yes = await confirm(`Delete "${source.name}" permanently?`, false);
  if (!yes) { warn("Cancelled."); return; }

  const resp = await adminFetch(apiBase, token, `/api/admin/sources/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (resp.ok) {
    success(`Removed: ${id}`);
  } else {
    fail(`Failed to remove: ${await resp.text()}`);
  }
}
