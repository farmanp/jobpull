/**
 * `jobpull sources` — interactive source management
 */

import {
  BOLD, RESET, GREEN, CYAN, DIM, RED, YELLOW,
  ask, confirm, ensureToken, adminFetch, success, fail, warn
} from "./helpers.ts";

type Source = {
  id: string;
  type: string;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
};

const SUPPORTED_SOURCE_TYPES = ["greenhouse", "lever", "remote_json", "ashby", "recruitee", "personio_xml"] as const;

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

  const type = await ask(
    "Source type (greenhouse / lever / remote_json / ashby / recruitee / personio_xml)",
    "greenhouse"
  );
  if (!SUPPORTED_SOURCE_TYPES.includes(type as (typeof SUPPORTED_SOURCE_TYPES)[number])) {
    fail("Invalid source type");
    return;
  }

  let id = "";
  let name = "";
  let base_url = "";
  let config_json = "{}";

  if (type === "greenhouse") {
    const company = await ask("Company name (e.g. stripe, airbnb)");
    if (!company) { fail("Company name required"); return; }
    const boardToken = await ask("Greenhouse board token", company.toLowerCase());
    const deptKeywords = await ask("Department keywords (comma-separated)", "product");

    id = `gh-${boardToken}`;
    name = `${company} Greenhouse`;
    base_url = "https://boards-api.greenhouse.io";
    config_json = JSON.stringify({
      boardToken,
      departmentKeywords: deptKeywords.split(",").map((s) => s.trim()),
    });
  } else if (type === "lever") {
    const company = await ask("Company name (e.g. netlify)");
    if (!company) { fail("Company name required"); return; }
    const site = await ask("Lever site slug", company.toLowerCase());
    const teamKeywords = await ask("Team keywords (comma-separated)", "product");

    id = `lever-${site}`;
    name = `${company} Lever`;
    base_url = "https://api.lever.co";
    config_json = JSON.stringify({
      site,
      teamKeywords: teamKeywords.split(",").map((s) => s.trim()),
    });
  } else if (type === "ashby") {
    const company = await ask("Company name (display label)");
    if (!company) { fail("Company name required"); return; }
    const organizationSlug = await ask("Ashby organization slug", company.toLowerCase());

    id = `ashby-${organizationSlug}`;
    name = `${company} Ashby`;
    base_url = "https://api.ashbyhq.com";
    config_json = JSON.stringify({ organizationSlug });
  } else if (type === "recruitee") {
    const company = await ask("Company name (display label)");
    if (!company) { fail("Company name required"); return; }
    const subdomain = await ask("Recruitee subdomain", company.toLowerCase());

    id = `recruitee-${subdomain}`;
    name = `${company} Recruitee`;
    base_url = `https://${subdomain}.recruitee.com`;
    config_json = JSON.stringify({ subdomain });
  } else if (type === "personio_xml") {
    const company = await ask("Company name (display label)");
    if (!company) { fail("Company name required"); return; }
    const companySlug = await ask("Personio company slug", company.toLowerCase());
    const language = await ask("Language", "en");

    id = `personio-${companySlug}`;
    name = `${company} Personio XML`;
    base_url = `https://${companySlug}.jobs.personio.de`;
    config_json = JSON.stringify({ companySlug, language });
  } else {
    name = await ask("Source name");
    const url = await ask("API URL");
    const sourceLabel = await ask("Source label", name.toLowerCase().replace(/\s+/g, ""));
    id = sourceLabel;
    base_url = new URL(url).origin;
    config_json = JSON.stringify({ url, sourceLabel });
  }

  const resp = await adminFetch(apiBase, token, "/api/admin/sources", {
    method: "POST",
    body: JSON.stringify({ id, type, name, base_url, config_json, enabled: true }),
  });

  if (resp.ok) {
    success(`Added source: ${name} (${id})`);
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
