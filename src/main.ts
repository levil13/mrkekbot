/**
 * Composition root — the dual-client walking skeleton (CFG-05, D-01, D-05, D-08).
 *
 * Boot ordering (RESEARCH Pattern 1):
 *   loadConfig -> user connect()+getMe() verify -> bot.init() readiness
 *   -> log "Both clients connected" -> fire bot.start() UNAWAITED -> installShutdown.
 *
 * Footguns guarded here:
 *   - `bot.start()` never resolves while polling (Pitfall 1) -> never awaited.
 *   - `connect()` is not proof of a valid session (Pitfall 2) -> getMe() verify.
 *   - dotenv loads BEFORE loadConfig so a contributor without Doppler still gets
 *     process.env populated; under `doppler run` it is a harmless no-op (Pitfall 7/D-08).
 */
// Dev-only plain-.env fallback. Loaded at the very top, before loadConfig reads
// process.env. Under `doppler run --` the vars are already injected, so this is
// a no-op (D-08).
import "dotenv/config";

import type { Bot } from "grammy";
import { loadConfig } from "./config/env.js";
import { createLogger } from "./logger.js";
import { buildUserClient, type UserClient } from "./telegram/user-client.js";
import { buildBotClient } from "./telegram/bot-client.js";

/** Bounded force-exit window: cleanup must finish within this or we hard-exit (D-05). */
const FORCE_EXIT_MS = 8000;

/**
 * Build, verify, and start both Telegram clients, then install graceful
 * shutdown. Refuses to start (process.exit non-zero) if either client fails to
 * connect, naming the failed client (D-01).
 */
export async function bootstrap(): Promise<void> {
  // 1) Validate the full env surface; exits non-zero naming every bad var (D-02).
  const config = loadConfig();
  const log = createLogger();

  // 2) USER CLIENT first — connect + verify with getMe() (fail-fast, D-01).
  const user = buildUserClient(config);
  try {
    const me = await user.connect();
    log.info(
      { userId: me.id?.toString() },
      "MTProto user client (GramJS) connected",
    );
  } catch (err) {
    log.fatal(
      { err },
      "MTProto user client (GramJS) failed to connect — refusing to start",
    );
    process.exit(1);
  }

  // 3) BOT CLIENT — init() calls getMe and sets botInfo (readiness signal, D-01).
  const bot = buildBotClient(config);
  try {
    await bot.init();
    log.info(
      { botUsername: bot.botInfo.username },
      "Bot API client (grammY) connected",
    );
  } catch (err) {
    log.fatal(
      { err },
      "Bot API client (grammY) failed to initialize — refusing to start",
    );
    process.exit(1);
  }

  // 4) Both verified-connected — the readiness contract Success Criterion 1 asserts.
  log.info("Both clients connected");

  // 5) Start long polling WITHOUT await: bot.start() resolves only after
  //    bot.stop() (Pitfall 1). A crash in the poll loop is fatal.
  bot
    .start({
      onStart: (info) =>
        log.info({ bot: info.username }, "long polling started"),
    })
    .catch((err: unknown) => {
      log.fatal({ err }, "bot polling crashed");
      process.exit(1);
    });

  // 6) Bounded graceful shutdown on signal (D-05).
  installShutdown(bot, user, log);
}

/**
 * Register idempotent SIGINT/SIGTERM handlers that stop both clients behind a
 * bounded `unref`'d force-exit timer — the process can never hang on shutdown (D-05).
 */
export function installShutdown(
  bot: Bot,
  user: UserClient,
  log: ReturnType<typeof createLogger>,
): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // ignore a repeat signal
    shuttingDown = true;
    log.info({ signal }, "shutting down");

    // Hard timeout: if cleanup hangs, force exit. unref() so this timer itself
    // never keeps the event loop alive.
    const force = setTimeout(() => {
      log.error("shutdown timed out — forcing exit");
      process.exit(1);
    }, FORCE_EXIT_MS);
    force.unref();

    try {
      await bot.stop(); // grammY: halts long polling gracefully
      await user.disconnect(); // GramJS: disconnects senders
      log.info("clean shutdown complete");
      process.exit(0);
    } catch (err) {
      log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

// Entrypoint: run the bootstrap when executed directly (dev/build/start scripts
// all target this file). A bootstrap rejection is fatal.
bootstrap().catch((err: unknown) => {
  console.error("fatal: bootstrap failed", err);
  process.exit(1);
});
