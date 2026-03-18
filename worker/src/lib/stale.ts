export const DEFAULT_STALE_THRESHOLD_DAYS = 14;

export function getStaleThresholdDays(raw?: string): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_STALE_THRESHOLD_DAYS;
  }

  return parsed;
}

export function getStaleCutoffIso(nowIso: string, thresholdDays: number): string {
  return new Date(Date.parse(nowIso) - thresholdDays * 24 * 60 * 60 * 1000).toISOString();
}

export function shouldMarkJobStale(dateSeenIso: string, nowIso: string, thresholdDays: number): boolean {
  return Date.parse(dateSeenIso) < Date.parse(getStaleCutoffIso(nowIso, thresholdDays));
}
