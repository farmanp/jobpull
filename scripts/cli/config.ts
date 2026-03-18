/**
 * `job-pull config` — interactive role-targeting wizard
 *
 * Walks the user through setting up what roles to search for,
 * then writes the config via PUT /api/admin/config.
 */

import {
  BOLD, RESET, GREEN, CYAN, DIM, RED,
  ask, confirm, ensureToken, adminFetch, success, fail, warn
} from "./helpers.ts";

function buildPatternFromKeywords(keywords: string[]): { label: string; source: string } {
  const escaped = keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const source = `\\b(${escaped.join("|")})\\b`;
  return { label: `User-defined: ${escaped.join(", ")}`, source };
}

async function collectKeywords(prompt: string): Promise<string[]> {
  const keywords: string[] = [];
  console.log(`\n${BOLD}${prompt}${RESET}`);
  console.log(`${DIM}  Enter one per line, press Enter on empty line to finish${RESET}`);

  while (true) {
    const kw = await ask("  >");
    if (!kw) break;
    keywords.push(kw);
    success(`Added: "${kw}"`);
  }

  return keywords;
}

export async function runConfig(apiBase: string, token: string) {
  token = await ensureToken(token);

  console.log(`\n${BOLD}🎯 job_pull — Role Configuration${RESET}`);
  console.log(`${DIM}Configure what kinds of jobs your board searches for${RESET}\n`);

  // 1. Fetch current config
  console.log(`${DIM}Fetching current config from ${apiBase}...${RESET}`);
  const resp = await adminFetch(apiBase, token, "/api/admin/config");
  if (!resp.ok) {
    const errText = await resp.text();
    fail(`Could not fetch config: ${resp.status} — ${errText}`);
    process.exit(1);
  }
  const current = await resp.json() as Record<string, unknown>;
  console.log(`${GREEN}✔${RESET} Connected to worker\n`);

  // 2. Board branding
  const changeBranding = await confirm("Change board branding (name, tagline)?", false);
  const updates: Record<string, unknown> = {};

  if (changeBranding) {
    updates.boardName = await ask("Board name", current.boardName as string);
    updates.tagline = await ask("Tagline", current.tagline as string);
    updates.contactEmail = await ask("Contact email", current.contactEmail as string);
  }

  // 3. Role targeting
  console.log(`\n${BOLD}── Role Targeting ──${RESET}`);
  console.log(`${DIM}Tell me what job titles to look for.${RESET}`);

  const includeKeywords = await collectKeywords(
    "🎯 What roles are you looking for? (e.g. 'software engineer', 'data analyst')"
  );

  if (includeKeywords.length > 0) {
    updates.titleIncludePatterns = [buildPatternFromKeywords(includeKeywords)];
  }

  const excludeKeywords = await collectKeywords(
    "🚫 Any roles to exclude? (e.g. 'devops engineer', 'intern')"
  );

  if (excludeKeywords.length > 0) {
    updates.titleExcludePatterns = [buildPatternFromKeywords(excludeKeywords)];
  }

  // 4. Remote filtering
  updates.remoteOnly = await confirm("\n🌍 Remote only?", true);

  // 5. Focus categories
  console.log(`\n${BOLD}── Focus Categories ──${RESET}`);
  console.log(`${DIM}Sub-categories to group jobs by (e.g. frontend, backend, fullstack)${RESET}`);

  const focusLabels = await collectKeywords(
    "📂 Focus categories (one per line)"
  );

  if (focusLabels.length > 0) {
    updates.focusCategories = focusLabels.map((label) => ({
      label: label.toLowerCase(),
      source: label.toLowerCase(),
    }));
  }

  // 6. Preview + confirm
  console.log(`\n${BOLD}── Preview ──${RESET}`);
  if (updates.boardName) console.log(`  Board:       ${CYAN}${updates.boardName}${RESET}`);
  if (includeKeywords.length > 0) console.log(`  Include:     ${GREEN}${includeKeywords.join(", ")}${RESET}`);
  if (excludeKeywords.length > 0) console.log(`  Exclude:     ${RED}${excludeKeywords.join(", ")}${RESET}`);
  console.log(`  Remote only: ${updates.remoteOnly ? GREEN + "Yes" : "No"}${RESET}`);
  if (focusLabels.length > 0) console.log(`  Categories:  ${CYAN}${focusLabels.join(", ")}${RESET}`);

  const proceed = await confirm("\nSave this config?", true);
  if (!proceed) {
    warn("Config not saved.");
    return;
  }

  // 7. Write
  const putResp = await adminFetch(apiBase, token, "/api/admin/config", {
    method: "PUT",
    body: JSON.stringify(updates),
  });

  if (!putResp.ok) {
    const errBody = await putResp.text();
    fail(`Failed to save config: ${putResp.status} — ${errBody}`);
    process.exit(1);
  }

  success("Config saved!");
  console.log(`\n${DIM}Run a crawl to apply the new filters: npx tsx scripts/cli/index.ts crawl${RESET}\n`);
}
