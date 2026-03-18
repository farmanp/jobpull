/**
 * `jobpull crawl` — trigger a manual crawl
 */

import {
  BOLD, RESET, GREEN, CYAN, DIM, RED,
  ensureToken, adminFetch, success, fail
} from "./helpers.ts";

export async function runCrawl(apiBase: string, token: string) {
  token = await ensureToken(token);

  console.log(`\n${BOLD}🕷️  jobpull — Manual Crawl${RESET}`);
  console.log(`${DIM}Triggering crawler on ${apiBase}...${RESET}\n`);

  const startTime = Date.now();

  const resp = await adminFetch(apiBase, token, "/api/admin/run-crawl", {
    method: "POST",
  });

  if (!resp.ok) {
    const err = await resp.text();
    fail(`Crawl failed: ${resp.status} — ${err}`);
    process.exit(1);
  }

  const result = (await resp.json()) as {
    runId: string;
    startedAt: string;
    finishedAt: string;
    jobsAdded: number;
    errors: { sourceId?: string; message: string }[];
    status: string;
  };

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`  ${BOLD}Run ID:${RESET}     ${result.runId}`);
  console.log(`  ${BOLD}Status:${RESET}     ${result.status === "success" ? GREEN : RED}${result.status.toUpperCase()}${RESET}`);
  console.log(`  ${BOLD}Jobs added:${RESET} ${CYAN}${result.jobsAdded}${RESET}`);
  console.log(`  ${BOLD}Duration:${RESET}   ${duration}s`);

  if (result.errors.length > 0) {
    console.log(`\n  ${RED}${BOLD}Errors (${result.errors.length}):${RESET}`);
    for (const err of result.errors) {
      console.log(`    ${RED}•${RESET} ${err.sourceId ? `[${err.sourceId}] ` : ""}${err.message}`);
    }
  }

  console.log("");
  success("Crawl complete!");
}
