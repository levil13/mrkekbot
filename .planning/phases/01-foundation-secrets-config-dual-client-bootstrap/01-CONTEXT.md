# Phase 1: Foundation — Secrets, Config & Dual-Client Bootstrap - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **runnable process skeleton** — nothing game-related yet.

In scope:
- Env-based config loader that validates every secret and id **at boot** and refuses to start when something is missing/malformed.
- Hardcoded participant/identity constants (TRUF, ADD, LUX=admin, KALASH, bot id) per SPEC §6.
- A composition root that starts **both** clients in one process — grammY Bot API (`BOT_TOKEN`) and GramJS MTProto user client (`SESSION_KEY`/`API_ID`/`API_HASH`) — with non-blocking startup and graceful shutdown on SIGINT/SIGTERM.
- Rotation of the leaked MTProto session, delivered as an executable login helper + a short runbook.
- Dev-onboarding artifacts: `.env.example`, README run/setup section, npm scripts.

Out of scope (later phases / deferred):
- Any kek game logic, persistence/`db.json`, or Telegram message/command handlers (Phases 2–3).
- The casino and all other MTProto raw calls (v2). The user client is **booted and verified-connected only** in this phase; it is not yet wired to any feature.
- Docker/VPS deployment artifacts (Dockerfile, .dockerignore) — explicitly deferred to a later deployment pass.

Requirements covered: **CFG-01, CFG-02, CFG-03, CFG-04, CFG-05** (locked in REQUIREMENTS.md / ROADMAP.md — see Canonical References).

</domain>

<decisions>
## Implementation Decisions

### Client boot policy
- **D-01: Fail-fast on either client.** If the grammY Bot API client OR the GramJS user client cannot connect at boot, the process refuses to start and logs which client failed and why. No degraded / Bot-API-only mode and no background-retry state in v1 — matches Success Criterion 1 ("logs both clients connected"). The user client is required to be up because v1 target resolution (KEK-02/KEK-03) depends on it later.

### Config validation & failure reporting
- **D-02: Aggregate-all validation.** zod validates the full env surface and reports **every** missing/invalid variable at once, then exits non-zero. Do not fail on the first missing var. The error output must name what is missing (Success Criterion 1).
- **D-03: Secrets vs constants split is locked** — `BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, the main chat id, and the casino relay channel id come from env (CFG-01/CFG-02); participant identities + admin (LUX) + bot account id are hardcoded constants (CFG-04). No secret may appear in source (Success Criterion 2).

### Secrets provider
- **D-08: Doppler is the secrets/env provider.** Secrets are injected as real environment variables at runtime via `doppler run -- <cmd>` (dev) and the equivalent on the VPS. **App code is unchanged** — the zod loader still reads `process.env`; Doppler is transparent to it (CFG-01 is satisfied: nothing in source). Implications:
  - npm scripts wrap the run/login commands with `doppler run --` (e.g. `dev`, `start`, `login`); keep an unwrapped variant or document the override so the app can still boot from a plain `.env` if Doppler is unavailable.
  - dotenv becomes optional/local-fallback only — Doppler is the primary path, a committed `.env`/dotenv load is the fallback for contributors not on Doppler.
  - `.env.example` is still shipped as the **authoritative list of required keys** — it doubles as the documented Doppler config schema.
  - README setup documents the Doppler path (install CLI, `doppler login`, `doppler setup`, `doppler run`) alongside the plain-`.env` fallback.

### Session rotation (CFG-03)
- **D-04: Executable login helper + runbook.** Ship a runnable tsx helper (e.g. `npm run login`) that prompts for phone/code and prints a fresh `StringSession`, plus a short markdown runbook documenting the rotation. Repeatable and hard to get wrong — not documentation-only. The compromised session must be rotated before any deploy (carries the STATE.md launch-gate blocker).

### Shutdown behavior (CFG-05)
- **D-05: Graceful shutdown with a force-exit timeout.** On SIGINT/SIGTERM, stop both clients cleanly; if either hangs past a bounded timeout (~5–10s, planner's call), force `process.exit` so the process can never hang (Success Criterion 5).

### Deliverable scope
- **D-06: Docker deferred.** No Dockerfile/.dockerignore in this phase; deliver the runnable process via tsx (dev) / tsc + node (prod) only.
- **D-07: Dev-onboarding artifacts ship in this phase** — `.env.example` (every required var, no real values; also serves as the Doppler key schema), a README run/setup section (install → Doppler `doppler run` *or* plain `.env` → generate session → run dev/prod), and npm scripts: `dev` (tsx watch), `build` (tsc), `start` (node), `login` (session generator) — run/login scripts wrapped with `doppler run --` per D-08.

### Claude's Discretion
- Module/file layout (config module, constants module, composition root, logging setup).
- Logging: pino is the locked choice (CLAUDE.md); level/format/what-to-log at boot is the planner's call. `pino-pretty` for dev only.
- Exact non-blocking startup mechanics — note the known grammY footgun: `bot.start()` does not resolve until the bot stops, so it must **not** be awaited as part of the boot sequence; confirm "both connected" via the appropriate readiness signals rather than awaiting the long-poll loop.
- Force-exit timeout duration and precise shutdown ordering.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Behavior reference (authoritative)
- `SPEC.md` — full reverse-engineered behavior of the original bot. Phase-1-relevant sections:
  - §3 — two-client architecture + the hardcoded-session security problem (the bug being fixed here).
  - §4 — environment variables (`BOT_TOKEN`, `API_ID`, `API_HASH`, new `SESSION_KEY`).
  - §6 — participant constants, admin (LUX), `MR_KEK_ID = 5362994462`, `ANIME_KONFA_ID = -1001685837062`, relay channel `-1001493761518` (the last two become env vars per CFG-02).
  - §10 — application lifecycle (parallel client start, graceful shutdown).
  - §11 — known bugs; §11.1 (hardcoded session) and §11.5/§11.6 (hardcoded ids) are the ones addressed in this phase.

### Project planning docs
- `.planning/REQUIREMENTS.md` — CFG-01..CFG-05 definitions (the locked requirements for this phase).
- `.planning/ROADMAP.md` §"Phase 1" — goal, success criteria, and the two planned plan slices (01-01 config/constants, 01-02 dual-client root + runbook).
- `.planning/PROJECT.md` — Context (participant ids spelled out), Constraints, Key Decisions.

### Tech stack (locked)
- `.claude/CLAUDE.md` — stack decisions: grammY (^1.44) over telegraf, GramJS (`telegram` ^2.26) via `StringSession` from `SESSION_KEY`, lowdb+async-mutex (Phase 2), zod (^4) for env validation, pino (^10) logging, dotenv (dev only), tsx/tsc/vitest tooling, node:22-bookworm-slim (when Docker lands later).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield. No `src/` exists yet; the only tracked files are `SPEC.md`, `Procfile`, `kek-bot.iml`, `.gitignore`. The original `index.js`/`constants.js` were removed; `SPEC.md` is their reverse-engineered replacement.

### Established Patterns
- None established yet. This phase sets the project's foundational patterns (config module, constants module, composition root, logging) that Phases 2–3 build on.

### Integration Points
- The config loader and constants become the inputs every later phase consumes (StateStore in Phase 2, handlers in Phase 3).
- The user client booted here is the connection later reused for v1 target resolution (KEK-02/KEK-03) and, in v2, the casino.

</code_context>

<specifics>
## Specific Ideas

- Env var naming follows SPEC §4 + CLAUDE.md: `BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, plus env vars for the main chat id and casino relay channel id (names at planner's discretion, e.g. `MAIN_CHAT_ID` / `RELAY_CHANNEL_ID`).
- Participant constants must preserve exact ids: TRUF/Дима 448341870, ADD/Эд 337052957, LUX/Лукас 372958499 (admin), KALASH/Андрей 261400005, bot `MR_KEK_ID` 5362994462.
- `login` helper exists specifically so the leaked session can be rotated before deploy without hand-editing code.

</specifics>

<deferred>
## Deferred Ideas

- **Docker/VPS deployment artifacts** (multi-stage Dockerfile, .dockerignore, non-root runtime) — separate deployment pass after the process boots cleanly here.
- **Casino + all other MTProto raw calls** (`messages.Search`/`GetHistory`, `channels.GetParticipants`, `messages.SendMedia`) — v2, out of this milestone.
- **Background-retry / degraded-mode resilience** for the user client — considered and rejected for v1 (fail-fast chosen); revisit only if connection flakiness becomes a real operational problem.

</deferred>

---

*Phase: 1-Foundation — Secrets, Config & Dual-Client Bootstrap*
*Context gathered: 2026-06-22*
