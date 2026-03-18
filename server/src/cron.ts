export interface CronField {
  wildcard: boolean;
  values: Set<number>;
}

export interface CronExpression {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

function expandPart(part: string, min: number, max: number): number[] {
  const [rangePart, stepPart] = part.split("/");
  const step = stepPart ? Number.parseInt(stepPart, 10) : 1;
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`Invalid cron step: ${part}`);
  }

  let start = min;
  let end = max;

  if (rangePart !== "*" && rangePart.includes("-")) {
    const [rawStart, rawEnd] = rangePart.split("-");
    start = Number.parseInt(rawStart, 10);
    end = Number.parseInt(rawEnd, 10);
  } else if (rangePart !== "*") {
    const value = Number.parseInt(rangePart, 10);
    start = value;
    end = value;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < min || end > max || start > end) {
    throw new Error(`Invalid cron range: ${part}`);
  }

  const values: number[] = [];
  for (let value = start; value <= end; value += step) {
    values.push(value);
  }

  return values;
}

function parseField(field: string, min: number, max: number, allowSevenForSunday = false): CronField {
  const trimmed = field.trim();
  if (trimmed === "*") {
    return { wildcard: true, values: new Set() };
  }

  const values = new Set<number>();
  for (const part of trimmed.split(",")) {
    const expanded = expandPart(part.trim(), min, max);
    for (let value of expanded) {
      if (allowSevenForSunday && value === 7) {
        value = 0;
      }
      values.add(value);
    }
  }

  return { wildcard: false, values };
}

export function parseCronExpression(expression: string): CronExpression {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression: ${expression}`);
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 7, true)
  };
}

function matchesField(field: CronField, value: number): boolean {
  return field.wildcard || field.values.has(value);
}

export function matchesCronExpression(expression: CronExpression, date: Date): boolean {
  return (
    matchesField(expression.minute, date.getUTCMinutes()) &&
    matchesField(expression.hour, date.getUTCHours()) &&
    matchesField(expression.dayOfMonth, date.getUTCDate()) &&
    matchesField(expression.month, date.getUTCMonth() + 1) &&
    matchesField(expression.dayOfWeek, date.getUTCDay())
  );
}

export function nextRunAfter(schedule: string, from = new Date()): Date {
  const expression = parseCronExpression(schedule);
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  const limit = new Date(from.getTime() + 366 * 24 * 60 * 60 * 1000);

  while (cursor.getTime() <= limit.getTime()) {
    if (matchesCronExpression(expression, cursor)) {
      return new Date(cursor.getTime());
    }

    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error(`Could not find next run for cron schedule within a year: ${schedule}`);
}

export interface CronScheduler {
  stop(): void;
}

export function startCronScheduler(
  schedule: string,
  task: () => Promise<void>,
  logger: Pick<Console, "log" | "error"> = console
): CronScheduler {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const scheduleNext = (): void => {
    if (stopped) {
      return;
    }

    let next: Date;
    try {
      next = nextRunAfter(schedule, new Date());
    } catch (error) {
      logger.error(`[scheduler] ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const delay = Math.max(0, next.getTime() - Date.now());
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) {
        return;
      }

      if (running) {
        scheduleNext();
        return;
      }

      running = true;
      try {
        await task();
      } catch (error) {
        logger.error(`[scheduler] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      } finally {
        running = false;
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}
