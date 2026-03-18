import { calculateBackoffMs, parseRetryAfterMs, sleep } from "./backoff";

interface FetchOptions {
  timeoutMs: number;
  maxRetries: number;
  userAgent: string;
}

interface HostState {
  active: number;
  waiters: Array<() => void>;
  lastRequestAt: number;
  consecutive429: number;
  pausedForRun: boolean;
}

export interface FetchResult {
  status: number;
  text?: string;
  notModified?: boolean;
}

export class SafeFetchClient {
  private readonly db: D1Database;
  private readonly options: FetchOptions;
  private readonly hostConcurrency: number;
  private readonly hostSpacingMs: number;
  private readonly hostState = new Map<string, HostState>();

  constructor(
    db: D1Database,
    options: FetchOptions,
    hostConcurrency = 2,
    hostSpacingMs = 750
  ) {
    this.db = db;
    this.options = options;
    this.hostConcurrency = hostConcurrency;
    this.hostSpacingMs = hostSpacingMs;
  }

  public isHostPaused(host: string): boolean {
    return this.getHostState(host).pausedForRun;
  }

  public async fetchText(url: string): Promise<FetchResult> {
    const host = this.getHost(url);
    const state = this.getHostState(host);
    if (state.pausedForRun) {
      throw new Error(`Host paused for run due to repeated 429: ${host}`);
    }

    return this.runOnHost(host, async () => {
      const cache = await this.db
        .prepare("SELECT etag, last_modified FROM fetch_cache WHERE url = ?")
        .bind(url)
        .first<{ etag?: string; last_modified?: string }>();

      for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
        try {
          const headers = new Headers({
            "User-Agent": this.options.userAgent,
            Accept: "application/json, application/rss+xml, application/xml, text/html;q=0.8, */*;q=0.5"
          });

          if (cache?.etag) {
            headers.set("If-None-Match", cache.etag);
          }

          if (cache?.last_modified) {
            headers.set("If-Modified-Since", cache.last_modified);
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort("timeout"), this.options.timeoutMs);
          let resp: Response;
          try {
            resp = await fetch(url, { method: "GET", headers, signal: controller.signal });
          } finally {
            clearTimeout(timeout);
          }

          await this.db
            .prepare(
              `INSERT INTO fetch_cache (url, etag, last_modified, last_status, last_fetched_at)
               VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT(url) DO UPDATE SET
                 etag = excluded.etag,
                 last_modified = excluded.last_modified,
                 last_status = excluded.last_status,
                 last_fetched_at = excluded.last_fetched_at`
            )
            .bind(
              url,
              resp.headers.get("etag"),
              resp.headers.get("last-modified"),
              resp.status,
              new Date().toISOString()
            )
            .run();

          if (resp.status === 304) {
            state.consecutive429 = 0;
            return { status: 304, notModified: true };
          }

          if (resp.status === 429 || resp.status === 503) {
            if (resp.status === 429) {
              state.consecutive429 += 1;
              if (state.consecutive429 >= 2) {
                state.pausedForRun = true;
              }
            }

            if (attempt === this.options.maxRetries || state.pausedForRun) {
              throw new Error(`HTTP ${resp.status} for ${url}`);
            }

            const retryAfterMs = parseRetryAfterMs(resp.headers.get("retry-after"));
            const delay = retryAfterMs ?? calculateBackoffMs(attempt);
            await sleep(delay);
            continue;
          }

          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status} for ${url}`);
          }

          state.consecutive429 = 0;
          return { status: resp.status, text: await resp.text() };
        } catch (err) {
          if (state.pausedForRun) {
            throw err;
          }

          if (attempt === this.options.maxRetries) {
            throw err instanceof Error ? err : new Error(String(err));
          }

          await sleep(calculateBackoffMs(attempt));
        }
      }

      throw new Error(`Exhausted retries for ${url}`);
    });
  }

  private getHost(url: string): string {
    return new URL(url).host;
  }

  private getHostState(host: string): HostState {
    const existing = this.hostState.get(host);
    if (existing) {
      return existing;
    }

    const state: HostState = {
      active: 0,
      waiters: [],
      lastRequestAt: 0,
      consecutive429: 0,
      pausedForRun: false
    };
    this.hostState.set(host, state);
    return state;
  }

  private async runOnHost<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getHostState(host);
    await this.acquire(state);
    try {
      const now = Date.now();
      const wait = Math.max(0, state.lastRequestAt + this.hostSpacingMs - now);
      if (wait > 0) {
        await sleep(wait);
      }
      state.lastRequestAt = Date.now();
      return await fn();
    } finally {
      this.release(state);
    }
  }

  private async acquire(state: HostState): Promise<void> {
    if (state.active < this.hostConcurrency) {
      state.active += 1;
      return;
    }

    await new Promise<void>((resolve) => state.waiters.push(resolve));
    state.active += 1;
  }

  private release(state: HostState): void {
    state.active = Math.max(0, state.active - 1);
    const next = state.waiters.shift();
    if (next) {
      next();
    }
  }
}
