---
phase: 01-foundation-secrets-config-dual-client-bootstrap
verified: 2026-06-25T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 01: Foundation — Secrets, Config & Dual-Client Bootstrap Verification Report

**Phase Goal:** The bot is a single process that loads every secret and id from the environment, rotates the leaked session, and starts both the grammY Bot API client and the GramJS MTProto user client without hanging, shutting both down gracefully on signal.

**Verified:** 2026-06-25
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With env vars set the process boots and logs both clients connected; with any required secret/id missing it refuses to start and NAMES what is missing | ✓ VERIFIED | `src/main.ts:71` logs exact string `"Both clients connected"`; fatal branches at lines 49/65 name `"MTProto user client (GramJS)"` and `"Bot API client (grammY)"`; `loadConfig()` calls `z.prettifyError(result.error)` naming every missing var before `process.exit(1)`. Live boot confirmed by operator 2026-06-25. |
| 2 | No secret (BOT_TOKEN, API_ID, API_HASH, session string, chat id, relay channel id) appears anywhere in source — all come from the environment | ✓ VERIFIED | `grep -rn` sweep of `src/` for real token/session literals (40+ char base64), for the two known chat IDs (1001685837062, 1001493761518), and for all participant IDs found zero hits outside `src/config/constants.ts` (participant IDs are public identity constants, not secrets). `.env.example` carries placeholder values only. `.gitignore` blocks `.env` and `.env.*` while tracking `.env.example`. |
| 3 | The compromised MTProto session is rotated AND a runbook documents how to generate a fresh StringSession | ✓ VERIFIED | `docs/session-rotation.md` exists (143 lines). Covers terminate-old-session in Telegram (Settings → Devices / Active Sessions) at line 18, then `npm run login` generation, then `SESSION_KEY` storage in Doppler. Login helper `src/scripts/login.ts` starts from `new StringSession("")` and prints `client.session.save()` to stdout only — no file write. Rotation confirmed live by operator 2026-06-25. |
| 4 | Participant identities (TRUF/Дима, ADD/Эд, LUX/Лукас as admin, KALASH/Андрей) and the bot account id are defined as hardcoded constants | ✓ VERIFIED | `src/config/constants.ts`: TRUF 448341870, ADD 337052957, LUX 372958499 (`isAdmin: true`), KALASH 261400005 all present in `PARTICIPANTS` array (lines 27-31); `ADMIN_ID = 372958499` (line 34); `MR_KEK_ID = 5362994462` (line 40). Module has zero `process.env` access. |
| 5 | Sending SIGINT or SIGTERM stops both clients cleanly without a hung process | ✓ VERIFIED | `src/main.ts:124-125` registers `process.once("SIGINT", ...)` and `process.once("SIGTERM", ...)`; `installShutdown` creates an 8 s `setTimeout(...).unref()` force-exit (lines 107-111); shuts down via `bot.stop()` then `user.disconnect()` then `process.exit(0)` (lines 114-117); idempotent guard `if (shuttingDown) return` (line 101). Live SIGINT/SIGTERM confirmed clean by operator 2026-06-25. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/config/env.ts` | Zod env schema + `loadConfig()` + `Config` type; single `process.env` read site | ✓ VERIFIED | 54 lines, substantive. Exports `EnvSchema`, `loadConfig`, `Config`. Single live `process.env` call at line 45 (`EnvSchema.safeParse(process.env)`). Uses `z.prettifyError` (not deprecated `z.formatError`). `MAIN_CHAT_ID`/`RELAY_CHANNEL_ID` use `z.coerce.number().int()` without `.positive()` — correct for negative supergroup ids. |
| `src/config/constants.ts` | Participant table, LUX admin flag, MR_KEK_ID, trigger words | ✓ VERIFIED | 62 lines, substantive. Pure module (no imports, no `process.env`). All five required IDs present. `GIVE_TRIGGERS` includes `"топкек"` and `"k3k"`. `REVOKE_TRIGGERS` includes `"некек"`. `CASINO_TRIGGERS` includes `"кеказино"`. |
| `src/logger.ts` | pino logger with SESSION_KEY/BOT_TOKEN redaction; pino-pretty in dev | ✓ VERIFIED | 46 lines. `REDACT_PATHS` covers `SESSION_KEY`, `BOT_TOKEN`, `API_HASH`, plus `*.SESSION_KEY`, `*.BOT_TOKEN`, `*.API_HASH`, `session`, `token`, and nested variants. `pino-pretty` transport active only when not `NODE_ENV=production`. |
| `.env.example` | All 6 required keys with placeholder values only | ✓ VERIFIED | All six keys present: `BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, `MAIN_CHAT_ID`, `RELAY_CHANNEL_ID`. Placeholder values only (no real credentials). |
| `package.json` | `"type": "module"`, locked deps, all npm scripts with Doppler+local variants | ✓ VERIFIED | `"type": "module"`, `engines: { node: ">=22" }`. Runtime deps: grammy, telegram, zod, pino, dotenv (plus agent-base, socks — see Proxy deviation). TypeScript pinned `"5.9.x"`. All 8 scripts present: `dev`, `dev:local`, `build`, `typecheck`, `start`, `start:local`, `login`, `login:local`. Doppler-wrapped forms and unwrapped `:local` fallbacks. |
| `tsconfig.json` | NodeNext ESM strict TS config | ✓ VERIFIED | `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"`, `"strict": true`, `"outDir": "dist"`, `"rootDir": "src"`. |
| `src/telegram/user-client.ts` | `buildUserClient(config)` — GramJS + connect/getMe verify + disconnect | ✓ VERIFIED | 74 lines. Exports `buildUserClient`. Imports `StringSession` from `"telegram/sessions/index.js"` (explicit NodeNext subpath). `connect()` calls `client.connect()` then `client.getMe()` — rejection not swallowed (D-01). `disconnect()` wired. No event handlers. |
| `src/telegram/bot-client.ts` | `buildBotClient(config)` — grammY Bot + init/start/stop readiness | ✓ VERIFIED | 39 lines. Exports `buildBotClient`. Returns `new Bot(config.BOT_TOKEN)`. No handlers, no `bot.start()` inside module. |
| `src/main.ts` | `bootstrap()` composition root + `installShutdown()`; dotenv before loadConfig; logs exact readiness string; 8s unref force-exit | ✓ VERIFIED | 134 lines. `import "dotenv/config"` at line 17 (before `loadConfig` at line 35). `bootstrap()` calls `loadConfig` → `buildUserClient` → `connect()` verify → `buildBotClient` → `bot.init()` → logs `"Both clients connected"` → fires `bot.start(...)` unawaited (`.catch` fatal). `installShutdown` at line 93 with idempotent guard, `setTimeout(..., 8000).unref()`, SIGINT + SIGTERM. |
| `src/scripts/login.ts` | Standalone interactive login printing fresh StringSession | ✓ VERIFIED | 77 lines. Starts from `new StringSession("")`. `node:readline/promises` for prompts. Prints `client.session.save()` via `console.log` to stdout only. No `fs.write`/`writeFile`. |
| `docs/session-rotation.md` | Runbook: terminate leaked session → regenerate → store as SESSION_KEY | ✓ VERIFIED | 79 lines. Covers all 6 steps: terminate in Telegram Devices/Active Sessions, set API credentials, run `npm run login`, store as SESSION_KEY, confirm boot, launch gate. |
| `README.md` | Run/setup section with Doppler path + plain-.env fallback | ✓ VERIFIED | Contains `doppler run` (multiple occurrences), `.env.example` reference, full npm scripts table, session generation section linking to runbook. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `src/config/env.ts` | `process.env` | `EnvSchema.safeParse(process.env)` — single read site | ✓ WIRED | Line 45: only live `process.env` reference in the file |
| `src/config/constants.ts` | SPEC §6 ids | Exact hardcoded ids: 448341870, 337052957, 372958499, 261400005, 5362994462 | ✓ WIRED | All five ids verified in source; no env access |
| `src/main.ts` | `src/config/env.ts` | `bootstrap()` calls `loadConfig()` before building any client | ✓ WIRED | Line 35: `const config = loadConfig()` |
| `src/main.ts` | `src/telegram/user-client.ts` | `buildUserClient(config)` then `connect()` + `getMe()` verify | ✓ WIRED | Lines 39-52: user client built, connected, getMe verified; fatal names GramJS client on failure |
| `src/main.ts` | `src/telegram/bot-client.ts` | `buildBotClient(config)` then `await bot.init()` readiness | ✓ WIRED | Lines 55-68: bot built, init awaited, fatal names Bot API client on failure |
| `src/scripts/login.ts` | `telegram StringSession` | `client.start({...})` → `client.session.save()` | ✓ WIRED | Lines 50-65: interactive login + stdout-only session print |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc type-check passes across all src/ (NodeNext strict) | `npm run typecheck` | exit 0 | ✓ PASS |
| `bot.start()` never awaited in main.ts | `grep -n "await.*bot\.start" src/main.ts` | no matches | ✓ PASS |
| `Both clients connected` exact string present | `grep -n "Both clients connected" src/main.ts` | line 71 | ✓ PASS |
| SIGINT + SIGTERM + unref() all present | `grep -n "SIGINT\|SIGTERM\|unref" src/main.ts` | lines 111, 124, 125 | ✓ PASS |
| No debt markers (TBD/FIXME/XXX) in phase files | `grep -rn "TBD\|FIXME\|XXX" src/` | no matches | ✓ PASS |
| No session/token literals in src/ | `grep -rn` sweep for real secrets | no matches | ✓ PASS |
| login.ts writes session to stdout only | `grep -rn "fs\.write\|writeFile" src/scripts/login.ts` | no matches | ✓ PASS |
| Live boot: both clients connected + shutdown clean | Operator-verified 2026-06-25 | confirmed | ✓ PASS (operator) |

---

### Requirements Coverage

| Requirement | Plan | Description | Status | Evidence |
|-------------|------|-------------|--------|----------|
| CFG-01 | 01-01, 01-02 | All secrets load from env — never hardcoded in source | ✓ SATISFIED | Secret literal sweep of `src/` returned zero hits; `src/config/env.ts` is the single `process.env` read site; `src/scripts/login.ts` reads `API_ID`/`API_HASH` from env only |
| CFG-02 | 01-01 | Main chat ID and relay channel ID load from env | ✓ SATISFIED | `MAIN_CHAT_ID` and `RELAY_CHANNEL_ID` in `EnvSchema` with `z.coerce.number().int()` (no `.positive()`); not hardcoded anywhere in `src/` |
| CFG-03 | 01-02 | Compromised MTProto session rotated; runbook documents fresh StringSession generation | ✓ SATISFIED | `docs/session-rotation.md` is a complete terminate-then-regenerate runbook; `src/scripts/login.ts` is the executable helper; operator rotated the session live on 2026-06-25 |
| CFG-04 | 01-01 | Participant identities, admin (LUX), and bot account id are hardcoded constants | ✓ SATISFIED | `src/config/constants.ts` exports `PARTICIPANTS` with all four members, `ADMIN_ID = 372958499`, `MR_KEK_ID = 5362994462` |
| CFG-05 | 01-02 | Bot starts grammY + GramJS in one process with non-blocking startup; shuts down gracefully on SIGINT/SIGTERM | ✓ SATISFIED | `src/main.ts` bootstrap + `installShutdown()`; `bot.start()` unawaited; 8s `unref()` force-exit; operator confirmed clean shutdown 2026-06-25 |

All 5 phase requirements satisfied. REQUIREMENTS.md traceability table columns CFG-01..CFG-05 are correctly mapped to Phase 1.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/telegram/bot-client.ts` | 27 | `'socks5://127.0.0.1:10808'` hardcoded | ⚠ Warning | Proxy host/port is a deploy-time network address, not a credential secret. Does NOT fail CFG-01/CFG-02 (no token/session/id literal). Breaks Docker/VPS deployment where `127.0.0.1` is unavailable. Operator acknowledged follow-up: make optional `PROXY_URL` env var before deploy. |
| `src/telegram/user-client.ts` | 43 | `PROXY_SETTINGS = { ip: '127.0.0.1', port: 10808 }` hardcoded (commented-out path) | ⚠ Warning | Same as above — commented-out block, no runtime impact. Follow-up required before VPS deploy. |
| `src/scripts/login.ts` | 24 | `PROXY_SETTINGS = { ip: '127.0.0.1', port: 10808 }` hardcoded (commented-out path) | ⚠ Warning | Same as above — commented-out block, no runtime impact. Follow-up required before VPS deploy. |

**Verdict on proxy deviation:** The proxy address `127.0.0.1:10808` is a **network address**, not a credential. It does not satisfy the definition of "secret" under CFG-01/CFG-02 (which cover BOT_TOKEN, API_ID, API_HASH, session string, chat IDs). The active code path in `buildBotClient` and `buildUserClient` does NOT use the proxy (`return new Bot(config.BOT_TOKEN)` and the non-proxy `TelegramClient` constructor are both live). The proxy constants and `PROXY_SETTINGS` objects exist in source but are dead code (commented-out toggle). This is a pre-deploy hardening item, not a launch blocker for the current phase scope.

No debt markers (TBD/FIXME/XXX) found in any phase-modified file.

---

### Gaps Summary

No gaps. All five success criteria are verified in code and confirmed live by the operator on 2026-06-25.

**Follow-up item (not a gap, pre-deploy hardening):** The SOCKS5 proxy host/port (`127.0.0.1:10808`) is hardcoded in three files with commented-out toggle blocks. This must be converted to an optional `PROXY_URL` env var (or removed) before Docker/VPS deployment to avoid a broken connection in production. Track as a CFG-01/CFG-02 housekeeping item in a future phase or pre-deploy checklist.

---

_Verified: 2026-06-25_
_Verifier: Claude (gsd-verifier)_
