/**
 * Shared helpers for CLI subcommands
 */

import { createInterface } from "node:readline";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

export { RESET, BOLD, GREEN, CYAN, YELLOW, RED, DIM };

export function success(msg: string) {
  console.log(`  ${GREEN}✔${RESET} ${msg}`);
}

export function warn(msg: string) {
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

export function fail(msg: string) {
  console.log(`  ${RED}✘${RESET} ${msg}`);
}

export function dim(msg: string): string {
  return `${DIM}${msg}${RESET}`;
}

export async function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` ${dim(`(${defaultVal})`)}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await ask(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

/**
 * Helper: make an authenticated API call to the Worker
 */
export async function adminFetch(
  apiBase: string,
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const resp = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  return resp;
}

/**
 * Prompt for admin token if not provided
 */
export async function ensureToken(token: string): Promise<string> {
  if (token) return token;
  console.log(`\n${YELLOW}⚠${RESET} No admin token provided. Use --token or set ADMIN_TOKEN env var.`);
  const entered = await ask("Enter admin token");
  if (!entered) {
    fail("Admin token is required for this command.");
    process.exit(1);
  }
  return entered;
}
