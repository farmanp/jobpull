#!/usr/bin/env node

/**
 * job_pull setup CLI
 *
 * Interactive setup for self-hosters:
 *   npx job-pull init        — full guided setup
 *   npx job-pull init --skip-db  — skip D1 creation (CI or existing DB)
 *
 * What it does:
 *   1. Checks prerequisites (node, wrangler)
 *   2. Prompts for board config (name, focus, email)
 *   3. Creates D1 database + patches wrangler.toml
 *   4. Applies migrations & seeds
 *   5. Generates .dev.vars with random admin token
 *   6. Writes .env for the web app
 *   7. Prints "you're ready!" summary
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { buildPackSeedSql, getRolePack, type PackName } from "./lib/packs.ts";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_DIR = join(ROOT, "worker");
const WEB_DIR = join(ROOT, "web");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function log(msg: string) {
  console.log(msg);
}

function step(n: number, msg: string) {
  log(`\n${CYAN}${BOLD}[${n}/6]${RESET} ${msg}`);
}

function success(msg: string) {
  log(`  ${GREEN}✔${RESET} ${msg}`);
}

function warn(msg: string) {
  log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

function fail(msg: string) {
  log(`  ${RED}✘${RESET} ${msg}`);
}

function dim(msg: string) {
  return `${DIM}${msg}${RESET}`;
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd: cwd ?? ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
}

async function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` ${dim(`(${defaultVal})`)}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const args = process.argv.slice(2);
  const skipDb = args.includes("--skip-db");

  log(`\n${BOLD}🚀 job_pull — Self-Host Setup${RESET}`);
  log(`${DIM}Set up your own job board in ~2 minutes${RESET}\n`);

  /* ── Step 1: Prerequisites ────────────────────────────────────── */
  step(1, "Checking prerequisites");

  const nodeVersion = process.version;
  const nodeMajor = Number.parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor < 20) {
    fail(`Node.js 20+ required (found ${nodeVersion})`);
    process.exit(1);
  }
  success(`Node.js ${nodeVersion}`);

  if (!commandExists("npx")) {
    fail("npx not found — install Node.js 20+");
    process.exit(1);
  }
  success("npx available");

  const hasWrangler = commandExists("wrangler");
  if (hasWrangler) {
    success("wrangler CLI found");
  } else {
    warn("wrangler not found globally — will use npx wrangler");
  }
  const wrangler = hasWrangler ? "wrangler" : "npx wrangler";

  /* ── Step 2: Board configuration ──────────────────────────────── */
  step(2, "Board configuration");

  const boardName = await ask("Board name", "Remote PM Jobs");
  const contactEmail = await ask("Contact email (for crawler User-Agent)", "you@example.com");
  const dbName = await ask("D1 database name", "job_pull_db");
  const packAnswer = await ask("Starter pack (product / engineering / design / gtm)", "product");
  const selectedPack = getRolePack(packAnswer)?.key ?? "product";

  success(`Board: "${boardName}" — DB: ${dbName} — Pack: ${selectedPack}`);

  /* ── Step 3: Create D1 database ───────────────────────────────── */
  step(3, "Setting up D1 database");

  let databaseId = "";

  if (skipDb) {
    warn("Skipping D1 creation (--skip-db). You must set database_id in wrangler.toml manually.");
    databaseId = "REPLACE_ME";
  } else {
    try {
      log(`  Running: ${dim(`${wrangler} d1 create ${dbName}`)}`);
      const output = run(`${wrangler} d1 create ${dbName}`, WORKER_DIR);
      const match = output.match(/database_id\s*=\s*"([^"]+)"/);
      if (match) {
        databaseId = match[1];
        success(`Created D1 database: ${databaseId}`);
      } else {
        warn("Could not parse database_id from wrangler output. Check manually.");
        databaseId = "REPLACE_ME";
      }
    } catch (err) {
      warn(`D1 creation failed — you may need to run 'wrangler login' first`);
      databaseId = "REPLACE_ME";
    }
  }

  // Patch wrangler.toml
  const wranglerPath = join(WORKER_DIR, "wrangler.toml");
  let wranglerContent = readFileSync(wranglerPath, "utf-8");
  wranglerContent = wranglerContent.replace(
    /database_id\s*=\s*"[^"]*"/,
    `database_id = "${databaseId}"`
  );
  wranglerContent = wranglerContent.replace(
    /database_name\s*=\s*"[^"]*"/,
    `database_name = "${dbName}"`
  );
  // Update user-agent with their email
  wranglerContent = wranglerContent.replace(
    /USER_AGENT\s*=\s*"[^"]*"/,
    `USER_AGENT = "JobPullBot/1.0 (+contact:${contactEmail})"`
  );
  writeFileSync(wranglerPath, wranglerContent);
  success("Updated wrangler.toml");

  /* ── Step 4: Migrations & Seeds ───────────────────────────────── */
  step(4, "Applying migrations & starter pack");

  try {
    run(`${wrangler} d1 migrations apply DB --local`, WORKER_DIR);
    success("Migrations applied (local)");
  } catch {
    warn("Local migration failed — run manually: cd worker && wrangler d1 migrations apply DB --local");
  }

  const packSeedPath = join(tmpdir(), `job-pull-pack-${Date.now()}.sql`);
  try {
    writeFileSync(packSeedPath, buildPackSeedSql(selectedPack as PackName, boardName, contactEmail));
    run(`${wrangler} d1 execute DB --local --file=${packSeedPath}`, WORKER_DIR);
    success(`Starter pack seeded (local): ${selectedPack}`);
  } catch {
    warn(`Starter pack seed failed — run manually with: npx tsx scripts/cli/index.ts packs apply ${selectedPack}`);
  } finally {
    try {
      unlinkSync(packSeedPath);
    } catch {
      // ignore temp cleanup failures
    }
  }

  /* ── Step 5: Generate secrets & env files ─────────────────────── */
  step(5, "Generating secrets & environment files");

  const adminToken = randomBytes(24).toString("base64url");

  // worker/.dev.vars
  const devVarsPath = join(WORKER_DIR, ".dev.vars");
  writeFileSync(devVarsPath, `ADMIN_TOKEN=${adminToken}\n`);
  success(`.dev.vars created (token: ${adminToken.slice(0, 8)}…)`);

  // web/.env
  const webEnvPath = join(WEB_DIR, ".env");
  if (!existsSync(webEnvPath)) {
    writeFileSync(
      webEnvPath,
      [
        "VITE_API_BASE=http://localhost:8787",
        `VITE_BOARD_NAME=${boardName}`,
        "",
      ].join("\n")
    );
    success("web/.env created");
  } else {
    warn("web/.env already exists — skipping");
  }

  /* ── Step 6: Done! ────────────────────────────────────────────── */
  step(6, "All set!");

  log(`
${GREEN}${BOLD}🎉 Your job board is ready!${RESET}

${BOLD}Start developing:${RESET}
  ${CYAN}npm run dev:worker${RESET}   ${dim("# API + crawler on :8787")}
  ${CYAN}npm run dev:web${RESET}      ${dim("# Frontend on :5173")}

${BOLD}Trigger a crawl:${RESET}
  ${CYAN}curl -X POST http://localhost:8787/api/admin/run-crawl \\${RESET}
  ${CYAN}  -H "Authorization: Bearer ${adminToken.slice(0, 8)}…"${RESET}

${BOLD}Customize your board:${RESET}
  Use ${CYAN}npx tsx scripts/cli/index.ts packs list${RESET} or ${CYAN}... packs apply engineering${RESET}
  to swap role presets, or ${CYAN}config${RESET} to tune filters manually.
  See ${CYAN}CUSTOMIZING.md${RESET} for a full guide.

${BOLD}Deploy to Cloudflare:${RESET}
  ${CYAN}cd worker && npx wrangler deploy${RESET}
  Then deploy ${CYAN}web/${RESET} to Cloudflare Pages.
`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
