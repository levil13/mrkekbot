# Walking Skeleton — Mr. Kek (Мистер Кек)

**Phase:** 1
**Generated:** 2026-06-22

## Capability Proven End-to-End

One process loads and validates every secret/id from the environment, connects BOTH the grammY Bot API client and the GramJS MTProto user client, verifies each is genuinely authorized, logs "Both clients connected", and shuts both down cleanly on SIGINT/SIGTERM — with the leaked session rotatable via a repeatable `npm run login` helper. Nothing game-related yet; this is the bootable backbone every later slice hangs off.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime / language | Node.js 22 LTS + TypeScript 5.9 (pinned, NOT 6.0), ESM (`"type":"module"`), NodeNext module resolution | Locked in CLAUDE.md; type-checking the balance/state logic is the whole point of the rewrite; 6.0 too new for the bot ecosystem types. Relative imports use explicit `.js` extensions (Pitfall 6). |
| Bot API client | grammY ^1.44 | Successor to the now-dead telegraf, by the same author; clean TS types. Lifecycle is `bot.init()` (readiness/getMe) + unawaited `bot.start()` + `bot.stop()` — NOT telegraf's `bot.launch()`. |
| MTProto user client | GramJS (`telegram`) ^2.26, `StringSession` from `SESSION_KEY` | Lowest porting risk from the original; the casino's raw calls (v2) carry over. Booted + verified only this phase. Stale since Feb 2025 — mtcute is the documented future migration target, kept contained behind a tiny adapter. |
| Config validation | zod ^4, single `loadConfig()` reading `process.env` once, `safeParse` aggregate fail-fast | Zod 4 collects all issues by default (D-02); names every missing/invalid var then exits non-zero. Single read site keeps the secret boundary auditable (CFG-01). |
| Secrets provider | Doppler (`doppler run -- <cmd>`) primary, plain `.env` + dotenv fallback | App code unchanged — reads `process.env` either way (D-08). `.env.example` is the authoritative key schema; `.env` is git-ignored. |
| Logging | pino ^10 with redaction of SESSION_KEY/BOT_TOKEN; pino-pretty in dev only | Long-running VPS process; redaction prevents credential leakage to logs (Security V7). |
| Identities | Hardcoded participant/admin/bot constants (TRUF, ADD, LUX=admin, KALASH, MR_KEK_ID) | Part of the joke for one closed group (CFG-04/D-03); a pure constants module with no I/O. Chat id + relay id stay in ENV (CFG-02), not hardcoded. |
| Shutdown | Graceful `bot.stop()` + `user.disconnect()` behind a ~8s `setTimeout(...).unref()` force-exit | The process can never hang on a signal (D-05/CFG-05). |
| Directory layout | `src/{config,telegram,scripts}` + `src/main.ts` + `src/logger.ts`; `docs/` for runbooks | Composition root owns lifecycle; adapters stay tiny; constants/config are pure inputs. `domain/`, `persistence/`, `telegram/handlers/` are Phase 2/3 — NOT created here. |
| Deployment | Deferred (D-06). tsx (dev) / tsc+node (prod) only; no Dockerfile this phase | Get a clean-booting process first; Docker/VPS is a later deployment pass. |

## Stack Touched in Phase 1

- [x] Project scaffold (package.json ESM + locked deps, tsconfig NodeNext strict, tsx/tsc, .gitignore)
- [x] Routing — n/a for a bot; equivalent is the dual-client boot path (Bot API long-poll + MTProto connect)
- [x] Database — n/a this phase (lowdb store is Phase 2); the real read/write proven here is the env config load + StringSession session.save()
- [x] UI — n/a; the interactive surface proven is the `npm run login` terminal flow and the boot/shutdown logs
- [x] Deployment — documented local full-stack run command (`npm run dev` / `npm run dev:local`) that boots both clients end-to-end; Docker deferred (D-06)

> Note: the standard skeleton checklist (DB read/write, UI interaction, deploy) is adapted for a headless dual-client bot. The full-stack proof here is: env -> validated Config -> user client connected+verified -> bot client connected+verified -> "Both clients connected" -> clean shutdown.

## Out of Scope (Deferred to Later Slices)

- Any kek game logic, balances, leaderboard, triggers, commands (Phases 2-3)
- Persistence / `db.json` / lowdb + async-mutex (Phase 2)
- Telegram message/command handlers and target resolution (Phase 3)
- The kek-casino and every other MTProto raw call (`messages.Search`/`GetHistory`, `channels.GetParticipants`, `messages.SendMedia`) — v2; the user client is booted+verified only, wired to nothing
- Docker/VPS deployment artifacts (Dockerfile, .dockerignore, non-root runtime) — D-06, later deployment pass
- Background-retry / degraded-mode resilience for the user client — considered and rejected for v1 (fail-fast chosen, D-01)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2:** Pure, unit-tested domain layer (giveKek/revokeKek/leaderboard/resetStats) behind a single async-mutex-guarded lowdb JSON store; all four SPEC §11 bugs fixed in isolation, 24h pruning, concurrency stress test.
- **Phase 3:** Live game loop — wire the validated domain to grammY handlers so members give/revoke keks via trigger words and run every command, with target resolution (reply / previous-meaningful / bot-author parse) using the user client booted here.
