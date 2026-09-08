type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const SENSITIVE_KEYS = /password|passwd|secret|token|cookie|authorization|session|credential/i;
const MAX_STRING = 1000;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.test(key) ? "[REDACTED]" : sanitize(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > MAX_STRING) {
    return `${value.slice(0, MAX_STRING)}…`;
  }
  return value;
}

function emit(level: LogLevel, event: string, context: LogContext = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: "mobix",
    environment: process.env.NODE_ENV ?? "unknown",
    version: process.env.npm_package_version ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
    event,
    ...sanitize(context) as Record<string, unknown>,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info(event: string, context?: LogContext) {
    emit("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    emit("warn", event, context);
  },
  error(event: string, error?: unknown, context: LogContext = {}) {
    emit("error", event, { ...context, error });
  },
};
