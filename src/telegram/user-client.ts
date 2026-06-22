/**
 * GramJS MTProto user-client adapter (CFG-05, D-01).
 *
 * This phase BOOTS AND VERIFIES the user client only — no feature is wired to
 * it (the casino's raw MTProto calls are v2/out of scope). The surface is kept
 * deliberately tiny (construct + connect/verify + disconnect) so a future
 * migration to mtcute stays contained.
 *
 * D-01 fail-fast: `connect()` succeeding is NOT proof of a valid session — it
 * only opens the transport (RESEARCH Pitfall 2). Authorization is proven by
 * `getMe()`, which rejects on a stale/invalid `StringSession`; that rejection
 * propagates so the composition root can refuse to start and name this client.
 */
import { TelegramClient } from "telegram";
// Explicit NodeNext subpath: the bare `telegram/sessions` import does not
// resolve under "moduleResolution":"NodeNext" with this stale package
// (RESEARCH Pitfall 5).
import { StringSession } from "telegram/sessions/index.js";
import type { Api } from "telegram";
import type { Config } from "../config/env.js";

/** The minimal user-client lifecycle surface the composition root depends on. */
export interface UserClient {
  /** The raw GramJS client (exposed for future feature wiring; unused this phase). */
  readonly client: TelegramClient;
  /**
   * Open the MTProto connection AND verify the session is actually authorized.
   * Rejects (fail-fast, D-01) if `getMe()` fails on a stale/invalid session.
   * @returns the authorized account (`getMe()` result) for readiness logging.
   */
  connect(): Promise<Api.User>;
  /** Gracefully disconnect on shutdown (keeps any registered handlers). */
  disconnect(): Promise<void>;
}

/**
 * Construct the GramJS user client from {@link Config}. Performs no I/O — the
 * caller drives the lifecycle via {@link UserClient.connect}/`disconnect`.
 */
export function buildUserClient(config: Config): UserClient {
  const client = new TelegramClient(
    new StringSession(config.SESSION_KEY),
    config.API_ID,
    config.API_HASH,
    { connectionRetries: 5 },
  );

  return {
    client,
    async connect(): Promise<Api.User> {
      await client.connect();
      // Authorization proof: rejects on an invalid/stale session (D-01).
      // Do NOT swallow — the composition root depends on this throwing.
      return client.getMe();
    },
    async disconnect(): Promise<void> {
      await client.disconnect();
    },
  };
}
