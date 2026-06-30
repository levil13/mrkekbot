---
phase: 01-foundation-secrets-config-dual-client-bootstrap
plan: 01
subsystem: config-foundation
tags: [config, secrets, constants, logging, scaffold, esm, typescript]
dependency_graph:
  requires: []
  provides:
    - "src/config/env.ts: loadConfig(), EnvSchema, Config type — single process.env read site"
    - "src/config/constants.ts: PARTICIPANTS, ADMIN_ID, MR_KEK_ID, GIVE/REVOKE/CASINO triggers"
    - "src/logger.ts: createLogger() pino with secret redaction"
    - "ESM TS scaffold: package.json, tsconfig.json, .gitignore, .env.example"
    - "env contract: BOT_TOKEN, API_ID, API_HASH, SESSION_KEY, MAIN_CHAT_ID, RELAY_CHANNEL_ID"
    - "npm scripts: dev, dev:local, build, typecheck, start, start:local, login, login:local"
  affects:
    - "plan 01-02 (composition root src/main.ts + login helper src/scripts/login.ts consume loadConfig/createLogger/constants)"
    - "Phase 2 StateStore and Phase 3 handlers consume config + constants"
tech_stack:
  added:
    - "grammy ^1.44, telegram ^2.26, zod ^4 (4.4.3), pino ^10, dotenv ^17 (runtime deps)"
    - "typescript pinned 5.9 (5.9.3), tsx ^4, pino-pretty ^13, @types/node (devDeps)"
  patterns:
    - "ESM/NodeNext strict TS (type:module, module/moduleResolution NodeNext, target ES2022)"
    - "Zod aggregate-all env validation: safeParse + z.prettifyError + process.exit(1) (D-02)"
    - "secret↔constant boundary: secrets in env only, public identities hardcoded (D-03)"
    - "pino redact of SESSION_KEY/BOT_TOKEN/API_HASH/token/session (Security V7)"
    - "Doppler-wrapped npm scripts with :local unwrapped fallbacks (D-08)"
key_files:
  created:
    - package.json
    - tsconfig.json
    - .env.example
    - src/config/env.ts
    - src/config/constants.ts
    - src/logger.ts
  modified:
    - .gitignore
decisions:
  - "Casino triggers stored space-stripped/lowercased (кеказино, кекказино, рандомныйкек, kekasino, kekcasino) to match SPEC §6 normalizeText behavior — one source of truth for matching"
  - "package-lock.json left gitignored per existing repo convention (not changed by this plan)"
  - "@types/node added so tsc --noEmit resolves process/console globals and types process.exit() as never under NodeNext strict"
metrics:
  duration_minutes: 6
  completed: 2026-06-22
  tasks: 3
  files_created: 6
  files_modified: 1
status: complete
---

# Phase 01 Plan 01: Foundation — Secrets, Config & Constants Summary

Greenfield ESM/TypeScript scaffold delivering a fail-fast Zod env loader (`loadConfig`), the hardcoded SPEC §6 participant/identity constants, and a secret-redacting pino logger — the two inputs every later phase consumes, with no secret in source.

## What Was Built

- **ESM TS scaffold** (Task 1): `package.json` (`type:module`, `engines node>=22`, locked deps grammy/telegram/zod/pino/dotenv, TS pinned 5.9, tsx + pino-pretty devDeps); npm scripts `build`/`typecheck`/`dev`/`dev:local`/`start`/`start:local`/`login`/`login:local` with `doppler run --` wrapped forms plus unwrapped `:local` fallbacks (D-07, D-08). `tsconfig.json` NodeNext module/moduleResolution, ES2022, strict, outDir dist, rootDir src. `.gitignore` extended to block all `.env` files (`.env.*` with `!.env.example`) plus `dist`, preserving existing lines (including the pre-existing uncommitted `.planning/` entry). No Docker artifacts (D-06 deferred).
- **Constants module** (Task 2): `src/config/constants.ts` — pure module (no env, no I/O) exporting `PARTICIPANTS` with exact SPEC §6 ids (TRUF/Дима 448341870, ADD/Эд 337052957, LUX/Лукас 372958499 admin, KALASH/Андрей 261400005), `ADMIN_ID = 372958499`, `MR_KEK_ID = 5362994462`, and `GIVE`/`REVOKE`/`CASINO` trigger lists.
- **Env loader + logger + example** (Task 3): `src/config/env.ts` exports `EnvSchema`, `loadConfig()`, `Config`. `loadConfig` reads `process.env` in exactly one place (`EnvSchema.safeParse(process.env)`), reports every missing/invalid var at once via `z.prettifyError` then `process.exit(1)` (D-02); `MAIN_CHAT_ID`/`RELAY_CHANNEL_ID` coerce to int WITHOUT `.positive()` (negative supergroup ids), `API_ID` is positive. `src/logger.ts` `createLogger()` configures pino `redact` over SESSION_KEY/BOT_TOKEN/API_HASH/token/session, pino-pretty only outside production. `.env.example` lists all six keys with placeholder values only.

## Verification Evidence

- `npm run typecheck` (tsc --noEmit, NodeNext strict): exit 0.
- Empty-env `loadConfig()`: exits non-zero (1) and stderr names every missing var (BOT_TOKEN, API_ID, API_HASH, SESSION_KEY, MAIN_CHAT_ID, RELAY_CHANNEL_ID) — Success Criterion 1.
- Full-env `loadConfig()`: returns typed Config with `MAIN_CHAT_ID === -1001685837062` (no `.positive()` rejection).
- Constants tsx verify: all five ids (448341870, 337052957, 372958499, 261400005, 5362994462) present, `MR_KEK_ID` exported.
- `grep -rIE` secret sweep across `src/`: no chat-id, relay-id, token, or session literal — Success Criterion 2 (CFG-01).
- `git check-ignore`: `.env` ignored, `.env.example` tracked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed locked dependencies**
- **Found during:** Task 3 (verification could not run — `Cannot find package 'zod'`).
- **Issue:** No `node_modules`; the plan's own tsx/typecheck verification requires the locked deps to be present.
- **Fix:** `npm install` (90 packages, 0 vulnerabilities). Packages are the explicitly locked, RESEARCH-cleared set (T-01-SC accept) — not a package-legitimacy question, so no checkpoint required.
- **Files modified:** none tracked (package-lock.json is gitignored per repo convention).

**2. [Rule 3 - Blocking] Added @types/node devDependency**
- **Found during:** Task 3 (`tsc --noEmit` failed: `Cannot find name 'process'/'console'`; `loadConfig` return type widened to `| undefined` because `process.exit` was untyped).
- **Issue:** NodeNext strict needs Node global typings; without them the typecheck gate (plan `<verification>`) fails.
- **Fix:** `npm install -D @types/node`; staged the resulting `package.json` change in the Task 3 commit.
- **Commit:** 5304917

**3. [Rule 1 - Hygiene] Removed example chat-id literal from a doc comment in env.ts**
- **Found during:** Task 3 secret-sweep gate.
- **Issue:** A doc comment used `-1001685837062` as an example; Success Criterion 2 forbids any secret/env-id value anywhere in `src/`.
- **Fix:** Genericized the comment to `-100…`.

### Notes (not deviations)
- Casino triggers are stored in their normalized (space-stripped, lowercased) form per SPEC §6 `normalizeText` semantics, so `кеказино` (not `кек казино`) is the stored key — a deliberate single-source-of-truth choice.
- Node on this machine is v18; `engines` requires >=22 (flagged in plan `user_setup` for plan 01-02's walking skeleton). tsx-based verification runs fine on v18; the EBADENGINE warning is expected and non-blocking for this plan.

## Authentication Gates

None.

## Known Stubs

None — every artifact is fully wired. The dev plain-`.env` dotenv import and the composition-root/login-helper entrypoints are intentionally deferred to plan 01-02 (documented in the plan), not stubs in this plan's scope.

## Self-Check: PASSED

- FOUND: package.json, tsconfig.json, .env.example, src/config/env.ts, src/config/constants.ts, src/logger.ts; .gitignore modified
- FOUND commit 492cdfe (Task 1), 5220c4f (Task 2), 5304917 (Task 3)
