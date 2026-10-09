/**
 * Keeper logger — wraps console with log level filtering.
 * Level is controlled by LP_SUITE_LOG_LEVEL env var (default: info).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const configuredLevel: LogLevel =
  (process.env.LP_SUITE_LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[configuredLevel];
}

function fmt(level: LogLevel, msg: string, meta?: object): string {
  const ts = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${ts}] [${level.toUpperCase()}] ${msg}${suffix}`;
}

export const logger = {
  debug(msg: string, meta?: object): void {
    if (shouldLog("debug")) console.debug(fmt("debug", msg, meta));
  },
  info(msg: string, meta?: object): void {
    if (shouldLog("info")) console.info(fmt("info", msg, meta));
  },
  warn(msg: string, meta?: object): void {
    if (shouldLog("warn")) console.warn(fmt("warn", msg, meta));
  },
  error(msg: string, meta?: object): void {
    if (shouldLog("error")) console.error(fmt("error", msg, meta));
  },
};
