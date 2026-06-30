---
phase: 01-foundation-secrets-config-dual-client-bootstrap
plan: 02
subsystem: dual-client-bootstrap
tags: [composition-root, grammy, gramjs, mtproto, graceful-shutdown, session-rotation, walking-skeleton]
dependency_graph:
  requires:
    - "01-01: loadConfig()/Config (src/config/env.ts), createLogger() (src/logger.ts), npm scripts dev/start/login"
  provides:
    - "src/telegram/user-client.ts: buildUserClient(config) — GramJS connect+getMe verify + disconnect (D-01 fail-fast)"
    - "src/telegram/bot-client.ts: buildBotClient(config) — grammY Bot for init/start/stop lifecycle"
    - "src/main.ts: bootstrap() + installShutdown() composition root; logs 'Both clients connected'; 8s unref force-exit"
    - "src/scripts/login.ts: interactive StringSession generator (CFG-03/D-04)"
    - "docs/session-rotation.md: terminate-then-regenerate runbook"
    - "README.md: Doppler + plain-.env run/setup + session generation"
  affects:
    - "Phase 2 StateStore wires into bootstrap(); Phase 3 handlers register on the grammY Bot built here"
    - "v2 casino consumes the GramJS user client (booted+verified-only this phase)"
tech_stack:
  added:
    - "agent-base ^8 + socks ^2 (SOCKS5 proxy support — operator addition, see Deviations)"
  patterns:
    - "Non-blocking dual-client startup: user connect+getMe -> bot.init readiness -> unawaited bot.start (Pitfall 1)"
    - "D-01 fail-fast: getMe()/bot.init() verify real authorization before 'Both clients connected'; refuse-to-start names the failed client"
    - "Graceful shutdown: idempotent process.once SIGINT/SIGTERM + setTimeout(...).unref() force-exit (D-05)"
    - "dotenv/config imported before loadConfig; harmless no-op under doppler run (D-08)"
    - "GramJS StringSession via explicit telegram/sessions/index.js subpath under NodeNext (Pitfall 5)"
    - "Tiny adapter surfaces (construct + lifecycle) so a future mtcute migration stays contained"
key_files:
  created:
    - src/telegram/user-client.ts
    - src/telegram/bot-client.ts
    - src/main.ts
    - src/scripts/login.ts
    - src/scripts/socks-agent.ts
    - docs/session-rotation.md
    - README.md
  modified:
    - package.json
decisions:
  - "Login prompts use node:readline/promises (zero-dependency) instead of the third-party `input` package — RESEARCH Open Question 1 recommendation; client.start only needs async string-returning functions"
  - "Force-exit timeout set to 8s (RESEARCH Open Question 2 recommendation, D-05 left to planner)"
  - "buildBotClient returns the bare grammY Bot (not a wrapper) — init/start/stop are already the right tiny lifecycle surface; the root owns sequencing"
  - "user-client exposes connect() returning the getMe() Api.User so the root logs userId without a second round-trip"
metrics:
  duration_minutes: 9
  completed: 2026-06-25
  tasks: 4
  files_created: 7
  files_modified: 1
status: complete
---

# Phase 01 Plan 02: Dual-Client Bootstrap & Session Rotation Summary

Completed the walking skeleton: a single process that loads config (01-01), connects and verifies BOTH Telegram clients (GramJS user via connect+getMe, grammY bot via init), logs the exact `Both clients connected` contract, fires the long-poll loop without blocking boot, and installs an idempotent SIGINT/SIGTERM shutdown with an 8s unref'd force-exit — plus the session-rotation slice (interactive login helper, runbook, README). The final blocking-human checkpoint (rotate the leaked session, live boot/shutdown verification with real credentials) is **awaiting the operator** — it cannot be performed by the executor.

## What Was Built

- **Telegram client adapters** (Task 1): `src/telegram/user-client.ts` exports `buildUserClient(config)` — constructs a GramJS `TelegramClient` with `new StringSession(config.SESSION_KEY)` (imported via the explicit `telegram/sessions/index.js` NodeNext subpath, Pitfall 5), `{ connectionRetries: 5 }`, and exposes `connect()` (which `connect()`s then verifies with `getMe()`, returning the `Api.User`; the rejection on an invalid session is NOT swallowed — D-01) and `disconnect()`. No event handlers, no raw API calls. `src/telegram/bot-client.ts` exports `buildBotClient(config)` returning a bare grammY `Bot(config.BOT_TOKEN)`; no handlers, no `bot.start()` inside the module (Pitfall 1).
- **Composition root** (Task 2): `src/main.ts` imports `dotenv/config` at the very top (before `loadConfig`, no-op under Doppler — D-08), then `bootstrap()`: `loadConfig()` → build logger → user `connect()`+`getMe()` (fatal naming "MTProto user client (GramJS)" + `exit(1)` on failure, D-01) → `bot.init()` (fatal naming "Bot API client (grammY)" + `exit(1)` on failure, D-01) → logs exactly `Both clients connected` → fires `bot.start({ onStart })` **unawaited** with a `.catch` fatal handler → `installShutdown()`. `installShutdown()` registers idempotent `process.once` SIGINT/SIGTERM handlers, a `setTimeout(..., 8000).unref()` force-exit, then `bot.stop()` → `user.disconnect()` → `exit(0)` (errors → `exit(1)`). Entry call `bootstrap().catch(...)`.
- **Session-rotation slice** (Task 3): `src/scripts/login.ts` — standalone tsx entrypoint reading `API_ID`/`API_HASH` from `process.env`, building a `TelegramClient` with an **empty** `StringSession("")`, prompting via `node:readline/promises` (zero-dep) for phone/code/2FA, then `console.log(client.session.save())` to **stdout only** (never written to a file), `disconnect()`, `exit(0)`. `docs/session-rotation.md` is the terminate-then-regenerate runbook (Telegram → Settings → Devices/Active Sessions first, then `npm run login`, store as `SESSION_KEY`, launch gate). `README.md` documents prerequisites, install, the Doppler `doppler run` path AND the plain-`.env` fallback (`.env.example`), session generation, and every npm script.

## Verification Evidence

- `npx tsc --noEmit -p tsconfig.json`: exit 0 across all of `src/` (adapters + main + login, NodeNext strict) — run after each task.
- Task 2 structure assertion: `await bot.start` absent, `Both clients connected` present, `SIGINT`+`SIGTERM` present, `unref()` present → "main.ts structure OK".
- dotenv import (line 17) precedes `loadConfig` call (line 35); both client names present in their respective fatal branches.
- Task 3 gate assertion: login helper prints `client.session.save()`, uses `StringSession`; runbook covers Devices/Active Sessions; README contains `doppler run` and `.env.example` → "rotation slice OK".
- No `fs.write`/`writeFile`/`appendFile` of the session in `login.ts`. Secret-literal sweep (`[A-Za-z0-9+/=_-]{40,}`) over the three new artifacts: only markdown table dash-rules matched — no session/token literal.
- Self-check: all 6 created files FOUND; commits 502a955, 978c2fa, e6427d5 FOUND; pre-existing dirty files (.planning/PROJECT.md, .claude/, SPEC.md) untouched.

## Deviations from Plan

**Operator-added SOCKS5 proxy (post-checkpoint, commit `6a2ee29`).** During live verification the operator added SOCKS5 proxy routing so both clients + the login helper reach Telegram through a local proxy (`socks5://127.0.0.1:10808`):
- `src/scripts/socks-agent.ts` (new): custom `SocksAgent extends agent-base.Agent` using the `socks` `SocksClient` (socks4/5, TLS for secure endpoints, optional auth) — consumed by grammY via `baseFetchConfig.agent`.
- `user-client.ts` + `login.ts`: GramJS `proxy: { ip, port, socksType: 5 }`.
- deps fixed by orchestrator before commit: declared `agent-base ^8` + `socks ^2` (actually imported), dropped unused `socks-proxy-agent` (was declared but never imported — latent build break). typecheck clean after fix.

**Known follow-up (flagged, operator chose "commit as-is"):** proxy host/port are hardcoded in three files with a commented on/off toggle. This works for the operator's local network but breaks the Docker/VPS deploy (127.0.0.1 won't exist there) and is inconsistent with CFG-01/CFG-02 (env-based config, nothing hardcoded). Make proxy configurable via an optional `PROXY_URL` env var before deploy. Also a minor style divergence (4-space/no-semicolons) in the three edited files vs the rest of `src/`.

The two planner-discretion items were resolved per the RESEARCH recommendations: `node:readline/promises` over `input` (Open Question 1), 8s force-exit (Open Question 2) — pre-sanctioned, not deviations.

## Authentication Gates

The final task (`checkpoint:human-verify`, `gate="blocking-human"`) IS an authentication/credential gate. The executor cannot:
- obtain real `BOT_TOKEN`/`API_ID`/`API_HASH`,
- run the interactive `npm run login` (phone/code/2FA) to mint a fresh `StringSession`,
- terminate the leaked session in the operator's Telegram account, or
- perform a live "Both clients connected" boot.

These are operator-only steps. The executor stopped at this gate without fabricating a connection. See the checkpoint block returned to the orchestrator.

## Known Stubs

None — every code artifact is fully wired. The user client is intentionally booted-and-verified only (no feature consumer) per the phase scope (casino is v2); this is documented in the plan, not a stub.

## Self-Check: PASSED

- FOUND: src/telegram/user-client.ts, src/telegram/bot-client.ts, src/main.ts, src/scripts/login.ts, docs/session-rotation.md, README.md
- FOUND commit 502a955 (Task 1), 978c2fa (Task 2), e6427d5 (Task 3)
- Pre-existing dirty files left untouched (.planning/PROJECT.md, .claude/, SPEC.md)

## Checkpoint State

**Status:** RESOLVED — operator approved on 2026-06-25. Task 4 (blocking-human) verified live: the leaked MTProto session was terminated + rotated, both clients logged `Both clients connected`, the missing-var refusal works, and SIGINT/SIGTERM shut down cleanly (operator confirmed "everything works"). The live boot was performed through the operator's SOCKS5 proxy (see Deviations). Plan 01-02 complete (4/4 tasks).
