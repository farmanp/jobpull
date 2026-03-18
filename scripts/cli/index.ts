#!/usr/bin/env node

/**
 * jobpull CLI — multi-command entry point
 *
 * Usage:
 *   npx tsx scripts/cli/index.ts init           — guided first-time setup
 *   npx tsx scripts/cli/index.ts config          — interactive role-targeting wizard
 *   npx tsx scripts/cli/index.ts sources         — manage job board sources
 *   npx tsx scripts/cli/index.ts crawl           — trigger a manual crawl
 *   npx tsx scripts/cli/index.ts status          — show board stats
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";

function printUsage() {
  console.log(`
${BOLD}🔍 jobpull CLI${RESET}
${DIM}Self-hosted job board management${RESET}

${BOLD}Usage:${RESET}
  npx tsx scripts/cli/index.ts <command>

${BOLD}Commands:${RESET}
  ${CYAN}init${RESET}       Guided first-time setup (DB, env files, config)
  ${CYAN}config${RESET}     Configure role targeting, focus areas, and branding
  ${CYAN}packs${RESET}      List, inspect, or apply starter role packs
  ${CYAN}sources${RESET}    List, add, toggle, or remove job board sources
  ${CYAN}crawl${RESET}      Trigger a manual crawl and show results
  ${CYAN}status${RESET}     Show board statistics

${BOLD}Options:${RESET}
  ${CYAN}--api-base${RESET}  Worker API URL ${DIM}(default: http://localhost:8787)${RESET}
  ${CYAN}--token${RESET}     Admin token for authenticated endpoints

${BOLD}Examples:${RESET}
  ${DIM}# First-time setup${RESET}
  npx tsx scripts/cli/index.ts init

  ${DIM}# Configure for engineering roles${RESET}
  npx tsx scripts/cli/index.ts config --api-base http://localhost:8787

  ${DIM}# Apply the engineering starter pack${RESET}
  npx tsx scripts/cli/index.ts packs apply engineering

  ${DIM}# Check board health${RESET}
  npx tsx scripts/cli/index.ts status
`);
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  const command = args[0] ?? "";
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  const apiBase = flags["api-base"] ?? "http://localhost:8787";
  const token = flags["token"] ?? process.env.ADMIN_TOKEN ?? "";

  switch (command) {
    case "init": {
      // Delegate to the existing setup.ts
      const { runInit } = await import("./init.ts");
      await runInit();
      break;
    }
    case "config": {
      const { runConfig } = await import("./config.ts");
      await runConfig(apiBase, token);
      break;
    }
    case "packs": {
      const { runPacks } = await import("./packs.ts");
      await runPacks(apiBase, token);
      break;
    }
    case "sources": {
      const { runSources } = await import("./sources.ts");
      await runSources(apiBase, token);
      break;
    }
    case "crawl": {
      const { runCrawl } = await import("./crawl.ts");
      await runCrawl(apiBase, token);
      break;
    }
    case "status": {
      const { runStatus } = await import("./status.ts");
      await runStatus(apiBase, token);
      break;
    }
    default:
      console.log(`${RED}Unknown command: ${command}${RESET}\n`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${RED}✘${RESET} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
