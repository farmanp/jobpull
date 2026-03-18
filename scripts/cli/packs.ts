import {
  BOLD,
  CYAN,
  DIM,
  GREEN,
  RED,
  RESET,
  YELLOW,
  adminFetch,
  ask,
  confirm,
  ensureToken,
  fail,
  success
} from "./helpers.ts";
import {
  buildPackConfigPatch,
  buildPackStarterSources,
  getRolePack,
  listRolePacks,
  type PackName
} from "../lib/packs.ts";

type ConfigResponse = {
  boardName: string;
  contactEmail: string;
  tagline: string;
};

type Source = {
  id: string;
  type: string;
  name: string;
  base_url: string;
  config_json: string;
  enabled: number;
};

function printUsage() {
  console.log(`\n${BOLD}Usage:${RESET} jobpull packs <list|show|apply> [pack]\n`);
}

function printPackSummary() {
  console.log(`\n${BOLD}🎒 jobpull — Starter Packs${RESET}\n`);
  for (const pack of listRolePacks()) {
    console.log(`  ${CYAN}${pack.key}${RESET} — ${pack.summary}`);
  }
  console.log("");
}

async function resolvePackName(arg?: string): Promise<PackName | null> {
  if (arg) {
    const pack = getRolePack(arg);
    return pack?.key ?? null;
  }

  const answer = await ask("Pack name (product / engineering / design / gtm)", "product");
  const pack = getRolePack(answer);
  return pack?.key ?? null;
}

function showPack(packName: PackName) {
  const pack = getRolePack(packName);
  if (!pack) {
    fail(`Unknown pack: ${packName}`);
    return;
  }

  console.log(`\n${BOLD}${pack.label}${RESET}`);
  console.log(`${DIM}${pack.summary}${RESET}\n`);
  console.log(`${BOLD}Starter sources:${RESET}`);
  for (const source of buildPackStarterSources(pack.key)) {
    console.log(`  ${GREEN}${source.id}${RESET} — ${source.name}`);
  }
  console.log(`\n${BOLD}Provider recommendations:${RESET}`);
  for (const recommendation of pack.providerRecommendations) {
    console.log(`  ${CYAN}${recommendation.type}${RESET} — ${recommendation.description}`);
  }
  console.log("");
}

async function applyPack(apiBase: string, token: string, packName: PackName) {
  token = await ensureToken(token);

  const pack = getRolePack(packName);
  if (!pack) {
    fail(`Unknown pack: ${packName}`);
    process.exit(1);
  }

  const configResp = await adminFetch(apiBase, token, "/api/admin/config");
  const sourcesResp = await adminFetch(apiBase, token, "/api/admin/sources");
  if (!configResp.ok || !sourcesResp.ok) {
    fail("Could not fetch current config or sources.");
    process.exit(1);
  }

  const currentConfig = (await configResp.json()) as ConfigResponse;
  const currentSources = ((await sourcesResp.json()) as { sources: Source[] }).sources;
  const updates = buildPackConfigPatch(packName);
  const starterSources = buildPackStarterSources(packName);

  console.log(`\n${BOLD}Apply Pack: ${pack.label}${RESET}`);
  console.log(`  Board name stays: ${CYAN}${currentConfig.boardName}${RESET}`);
  console.log(`  Contact email stays: ${CYAN}${currentConfig.contactEmail}${RESET}`);
  console.log(`  Tagline → ${updates.tagline}`);
  console.log(`  Remote only → ${updates.remoteOnly ? GREEN + "true" + RESET : RED + "false" + RESET}`);
  console.log(`\n${BOLD}Managed starter sources:${RESET}`);
  for (const source of starterSources) {
    const state = currentSources.some((current) => current.id === source.id) ? "update" : "create";
    console.log(`  ${state === "create" ? GREEN : YELLOW}${state}${RESET} ${source.id} → ${source.name}`);
  }

  const proceed = await confirm("\nApply this pack?", true);
  if (!proceed) {
    console.log(`\n${YELLOW}⚠${RESET} Cancelled.\n`);
    return;
  }

  const configPutResp = await adminFetch(apiBase, token, "/api/admin/config", {
    method: "PUT",
    body: JSON.stringify(updates)
  });
  if (!configPutResp.ok) {
    fail(`Failed to apply config: ${await configPutResp.text()}`);
    process.exit(1);
  }

  for (const source of starterSources) {
    const existing = currentSources.find((current) => current.id === source.id);
    if (existing) {
      if (existing.type !== "remote_json") {
        fail(`Managed source id "${source.id}" already exists with non-remote_json type.`);
        process.exit(1);
      }

      const resp = await adminFetch(apiBase, token, `/api/admin/sources/${encodeURIComponent(source.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          name: source.name,
          base_url: source.base_url,
          config_json: source.config_json,
          enabled: true
        })
      });
      if (!resp.ok) {
        fail(`Failed to update source "${source.id}": ${await resp.text()}`);
        process.exit(1);
      }
    } else {
      const resp = await adminFetch(apiBase, token, "/api/admin/sources", {
        method: "POST",
        body: JSON.stringify(source)
      });
      if (!resp.ok) {
        fail(`Failed to create source "${source.id}": ${await resp.text()}`);
        process.exit(1);
      }
    }
  }

  success(`Applied ${pack.label} pack.`);
  console.log(`\n${DIM}Run a crawl to populate the updated source set: npx tsx scripts/cli/index.ts crawl${RESET}\n`);
}

export async function runPacks(apiBase: string, token: string) {
  const args = process.argv.slice(3);
  const action = args[0] ?? "list";
  const maybePack = args[1];

  switch (action) {
    case "list":
      printPackSummary();
      return;
    case "show": {
      const packName = await resolvePackName(maybePack);
      if (!packName) {
        fail(`Unknown pack: ${maybePack ?? "(empty)"}`);
        printPackSummary();
        return;
      }
      showPack(packName);
      return;
    }
    case "apply": {
      const packName = await resolvePackName(maybePack);
      if (!packName) {
        fail(`Unknown pack: ${maybePack ?? "(empty)"}`);
        printPackSummary();
        return;
      }
      await applyPack(apiBase, token, packName);
      return;
    }
    default:
      printUsage();
  }
}
