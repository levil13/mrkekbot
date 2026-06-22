/**
 * Fail-fast environment configuration loader (CFG-01, CFG-02, D-02).
 *
 * This is the ONLY place in the app that reads `process.env`. The schema below
 * is the authoritative env surface (D-03): three secrets, the MTProto credentials,
 * and the two env-configurable Telegram ids (CFG-02). No value is hardcoded here.
 *
 * Secrets are injected at process launch — primarily by Doppler (`doppler run --`,
 * D-08), with a plain-`.env` dotenv fallback wired at the composition root (plan
 * 01-02). Either way, this loader only ever observes `process.env`.
 */
import { z } from "zod";

/**
 * The full env surface validated at boot. Zod 4 collects ALL issues by default
 * (checks are "continuable"), so a single `safeParse` reports every missing or
 * invalid variable at once (D-02) — no early-return-on-first-error logic.
 */
export const EnvSchema = z.object({
  /** Bot API token from @BotFather. */
  BOT_TOKEN: z.string().min(1),
  /** MTProto App API ID (positive integer). */
  API_ID: z.coerce.number().int().positive(),
  /** MTProto App API Hash. */
  API_HASH: z.string().min(1),
  /** MTProto StringSession (rotated; never hardcoded — SPEC §3/§11.1). */
  SESSION_KEY: z.string().min(1),
  /** Main chat id — large negative supergroup id (-100…); NO .positive(). */
  MAIN_CHAT_ID: z.coerce.number().int(),
  /** Casino relay channel id — large negative channel id; NO .positive(). */
  RELAY_CHANNEL_ID: z.coerce.number().int(),
});

/** Typed configuration inferred from {@link EnvSchema}. */
export type Config = z.infer<typeof EnvSchema>;

/**
 * Validate the full env surface and return a typed {@link Config}.
 *
 * On any missing/invalid variable, prints every issue at once to stderr
 * (D-02) via `z.prettifyError` so the operator sees each offending variable
 * by name, then exits non-zero — the process can never boot half-configured.
 */
export function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Zod 4 aggregates ALL issues; prettifyError names every missing/invalid var.
    console.error(
      "Invalid environment configuration:\n" + z.prettifyError(result.error),
    );
    process.exit(1);
  }
  return result.data;
}
