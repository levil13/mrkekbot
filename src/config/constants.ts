/**
 * Hardcoded public identities and trigger words (SPEC §6).
 *
 * PURE module: no environment access, no I/O, no imports of the env loader.
 * Only PUBLIC identities live here (CFG-04 / D-03). Secrets — BOT_TOKEN, API_ID,
 * API_HASH, SESSION_KEY — and the env-configurable ids (main chat id, relay
 * channel id, CFG-02) are NEVER hardcoded in this file.
 */

/** A chat participant with a fixed Telegram identity (SPEC §6). */
export interface Participant {
  /** Internal codename used in the original bot. */
  readonly code: string;
  /** Telegram user id. */
  readonly id: number;
  /** Display name shown in the leaderboard. */
  readonly name: string;
  /** Whether this participant is the bot admin (only LUX). */
  readonly isAdmin: boolean;
}

/**
 * The four hardcoded participants with their exact Telegram ids (SPEC §6).
 * LUX is the sole admin (the only one allowed to run /start and /reset).
 */
export const PARTICIPANTS: readonly Participant[] = [
  { code: "TRUF", id: 448341870, name: "Дима", isAdmin: false },
  { code: "ADD", id: 337052957, name: "Эд", isAdmin: false },
  { code: "LUX", id: 372958499, name: "Лукас", isAdmin: true },
  { code: "KALASH", id: 261400005, name: "Андрей", isAdmin: false },
] as const;

/** Telegram id of the admin participant (LUX) — SPEC §6. */
export const ADMIN_ID = 372958499;

/**
 * Telegram id of the bot's own account (SPEC §6).
 * Used to recognise messages sent by the bot itself.
 */
export const MR_KEK_ID = 5362994462;

/** Lowercased, space-stripped words that GIVE a kek (SPEC §6). */
export const GIVE_TRIGGERS: readonly string[] = [
  "кек",
  "kek",
  "топкек",
  "topkek",
  "k3k",
] as const;

/** Lowercased, space-stripped words that REVOKE a kek — некек (SPEC §6). */
export const REVOKE_TRIGGERS: readonly string[] = ["некек", "nekek"] as const;

/** Lowercased, space-stripped words that launch the kek-casino (SPEC §6). */
export const CASINO_TRIGGERS: readonly string[] = [
  "кеказино",
  "кекказино",
  "рандомныйкек",
  "kekasino",
  "kekcasino",
] as const;
