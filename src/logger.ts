/**
 * Structured logging with secret redaction (Security Domain V7, T-01-02).
 *
 * A loaded credential must never reach the logs. The pino `redact` config below
 * censors SESSION_KEY/BOT_TOKEN (and nested token/session fields) so even an
 * accidental `log.info({ config })` cannot leak a secret. `pino-pretty` is used
 * only outside production.
 */
import pino, { type Logger } from "pino";

/** Field paths censored from every log line so secrets never appear. */
const REDACT_PATHS = [
  "SESSION_KEY",
  "BOT_TOKEN",
  "API_HASH",
  "*.SESSION_KEY",
  "*.BOT_TOKEN",
  "*.API_HASH",
  "session",
  "*.session",
  "token",
  "*.token",
];

/**
 * Create the application logger. Redacts secrets unconditionally; enables the
 * human-readable `pino-pretty` transport only when not running in production.
 */
export function createLogger(): Logger {
  const isProduction = process.env.NODE_ENV === "production";
  return pino({
    level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
    ...(isProduction
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }),
  });
}
