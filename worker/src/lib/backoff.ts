export function calculateBackoffMs(
  attempt: number,
  opts?: { baseMs?: number; maxMs?: number; jitterRatio?: number; randomFn?: () => number }
): number {
  const baseMs = opts?.baseMs ?? 1000;
  const maxMs = opts?.maxMs ?? 30000;
  const jitterRatio = opts?.jitterRatio ?? 0.2;
  const randomFn = opts?.randomFn ?? Math.random;

  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitter = exp * jitterRatio * randomFn();
  return Math.floor(Math.min(maxMs, exp + jitter));
}

export function parseRetryAfterMs(header: string | null): number | null {
  if (!header) {
    return null;
  }

  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt)) {
    return Math.max(0, asInt * 1000);
  }

  const date = Date.parse(header);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.max(0, date - Date.now());
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}
