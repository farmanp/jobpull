/**
 * `jobpull init` — delegates to the original setup.ts wizard
 */

import { resolve, join } from "node:path";

export async function runInit() {
  const ROOT = resolve(import.meta.dirname, "../..");
  const setupPath = join(ROOT, "scripts", "setup.ts");

  // Dynamically import and run the original setup script
  console.log("Launching setup wizard...\n");

  // Re-execute via the same process
  const { execSync } = await import("node:child_process");
  execSync(`npx tsx ${setupPath}`, { stdio: "inherit", cwd: ROOT });
}
