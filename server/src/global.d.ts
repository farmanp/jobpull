declare interface D1ResultMeta {
  changes?: number;
  last_row_id?: number;
}

declare interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  meta?: D1ResultMeta;
}

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

declare interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

declare interface ScheduledEvent {
  cron?: string;
  scheduledTime?: number;
  noRetry?: boolean;
  waitUntil?(promise: Promise<unknown>): void;
}
