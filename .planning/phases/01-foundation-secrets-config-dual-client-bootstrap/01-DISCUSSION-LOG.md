# Phase 1: Foundation — Secrets, Config & Dual-Client Bootstrap - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 1-Foundation — Secrets, Config & Dual-Client Bootstrap
**Areas discussed:** Client boot policy, Config failure reporting, Session-rotation deliverable, Shutdown behavior, Docker scope, Dev-onboarding artifacts

---

## Client boot policy

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-fast | Either client fails to connect → process refuses to start, logs why | ✓ |
| Degraded mode | Bot API starts even if user client fails; user-client features unavailable | |
| Degraded + retry | Bot API starts immediately, user client retries in background with backoff | |

**User's choice:** Fail-fast
**Notes:** Matches Success Criterion 1 ("logs both clients connected"). v1 needs the user client available for later target resolution (KEK-02/03), so no half-up state.

---

## Config failure reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate all | zod reports ALL missing/invalid vars at once, then exits non-zero | ✓ |
| Fail on first | Exit on the first missing var encountered | |

**User's choice:** Aggregate all
**Notes:** Best DX (fix everything in one pass); satisfies "names what is missing".

---

## Session-rotation deliverable (CFG-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Script + runbook | Executable tsx login helper (npm run login) prints fresh StringSession + markdown runbook | ✓ |
| Runbook only | Markdown doc with manual steps to generate the StringSession | |

**User's choice:** Script + runbook
**Notes:** Repeatable, hard to get wrong; lets the leaked session be rotated before deploy without editing code.

---

## Shutdown behavior (CFG-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Graceful + timeout | Stop both clients; force process.exit if either hangs past a timeout | ✓ |
| Graceful, wait fully | Stop both clients, wait for clean shutdown, no forced exit | |

**User's choice:** Graceful + timeout
**Notes:** Guarantees no hung process per Success Criterion 5.

---

## Docker scope

| Option | Description | Selected |
|--------|-------------|----------|
| Include in Phase 1 | Build multi-stage Dockerfile + .dockerignore now | |
| Defer to later | Phase 1 delivers only the runnable process (tsx/tsc); containerize later | ✓ |

**User's choice:** Defer to later
**Notes:** Keeps the phase tight to config/client logic; containerization is a separate deployment pass.

---

## Dev-onboarding artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| .env.example | Committed template of every required env var (no real values) | ✓ |
| README run/setup section | Install / set env / generate session / run dev+prod notes | ✓ |
| npm scripts | dev (tsx watch), build (tsc), start (node), login (session generator) | ✓ |

**User's choice:** All three (multi-select)
**Notes:** Pairs the `.env.example` surface with aggregate validation and the login helper.

---

## Post-discussion addition

**Secrets provider — Doppler.** User added after the question round: secrets/env will be provided via **Doppler**, injected as runtime env vars (`doppler run -- <cmd>`). App code unchanged (zod still reads `process.env`); npm run/login scripts wrap with `doppler run --`, `.env`/dotenv kept as a local fallback, `.env.example` doubles as the Doppler key schema. Captured as D-08 in CONTEXT.md.

---

## Claude's Discretion

- Module/file layout (config module, constants module, composition root, logging setup).
- pino log level/format and what to log at boot (`pino-pretty` dev only).
- Non-blocking startup mechanics — note the grammY `bot.start()` no-await footgun.
- Force-exit timeout duration and shutdown ordering.
- Env var names for the main chat id and relay channel id.

## Deferred Ideas

- Docker/VPS deployment artifacts (Dockerfile, .dockerignore, non-root runtime).
- Casino + all other MTProto raw calls (v2).
- Background-retry / degraded-mode resilience for the user client (considered, rejected for v1).
