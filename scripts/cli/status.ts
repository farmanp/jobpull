/**
 * `jobpull status` — show board statistics
 */

import {
  BOLD, RESET, GREEN, CYAN, DIM, RED, YELLOW
} from "./helpers.ts";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export async function runStatus(apiBase: string, _token: string) {
  console.log(`\n${BOLD}📊 jobpull — Board Status${RESET}`);
  console.log(`${DIM}Fetching from ${apiBase}...${RESET}\n`);

  // Meta
  const metaResp = await fetch(`${apiBase}/api/meta`);
  if (!metaResp.ok) {
    console.log(`  ${RED}✘${RESET} Could not reach API at ${apiBase}`);
    console.log(`${DIM}  Is the worker running? Try: npm run dev:worker${RESET}\n`);
    process.exit(1);
  }
  const meta = (await metaResp.json()) as {
    boardName: string;
    tagline: string;
    remoteOnly: boolean;
    focusCategories: string[];
  };

  // Stats
  const statsResp = await fetch(`${apiBase}/api/stats`);
  const stats = statsResp.ok
    ? ((await statsResp.json()) as {
        totalJobs: number;
        visibleJobs?: number;
        staleJobs?: number;
        activeSources: number;
        staleThresholdDays?: number;
        lastCrawl: { finishedAt: string; status: string; jobsAdded: number } | null;
      })
    : null;

  // Health
  const healthResp = await fetch(`${apiBase}/api/health`);
  const health = healthResp.ok
    ? ((await healthResp.json()) as { ok: boolean; time: string })
    : null;

  // Display
  console.log(`  ${BOLD}Board:${RESET}          ${CYAN}${meta.boardName}${RESET}`);
  console.log(`  ${BOLD}Tagline:${RESET}        ${meta.tagline}`);
  console.log(`  ${BOLD}Remote only:${RESET}    ${meta.remoteOnly ? GREEN + "Yes" : "No"}${RESET}`);
  console.log(`  ${BOLD}Categories:${RESET}     ${meta.focusCategories.join(", ") || DIM + "none" + RESET}`);
  console.log("");

  if (stats) {
    console.log(`  ${BOLD}Visible jobs:${RESET}   ${CYAN}${(stats.visibleJobs ?? stats.totalJobs).toLocaleString()}${RESET}`);
    console.log(`  ${BOLD}Stored jobs:${RESET}    ${stats.totalJobs.toLocaleString()}`);
    console.log(`  ${BOLD}Stale hidden:${RESET}   ${stats.staleJobs ?? 0}${stats.staleThresholdDays ? ` (${stats.staleThresholdDays}d threshold)` : ""}`);
    console.log(`  ${BOLD}Active sources:${RESET} ${stats.activeSources}`);
    if (stats.lastCrawl) {
      const statusColor = stats.lastCrawl.status === "success" ? GREEN
        : stats.lastCrawl.status === "partial" ? YELLOW
        : RED;
      console.log(`  ${BOLD}Last crawl:${RESET}     ${timeAgo(stats.lastCrawl.finishedAt)} — ${statusColor}${stats.lastCrawl.status.toUpperCase()}${RESET} (+${stats.lastCrawl.jobsAdded} jobs)`);
    } else {
      console.log(`  ${BOLD}Last crawl:${RESET}     ${DIM}never${RESET}`);
    }
  } else {
    console.log(`  ${YELLOW}⚠${RESET} Could not fetch stats (DB may not be initialized)`);
  }

  console.log("");

  if (health?.ok) {
    console.log(`  ${GREEN}●${RESET} Worker is ${GREEN}healthy${RESET} — ${DIM}${health.time}${RESET}`);
  } else {
    console.log(`  ${RED}●${RESET} Worker health check failed`);
  }

  console.log("");
}
