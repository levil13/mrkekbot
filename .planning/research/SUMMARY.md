# Project Research Summary

**Project:** Mr. Kek (Мистер Кек)
**Domain:** Dual-client Telegram group-chat virtual-currency game bot (Node.js + TypeScript)
**Researched:** 2026-06-22
**Confidence:** HIGH (stack + architecture + pitfalls from SPEC bugs); MEDIUM (features genre comparison)

## Executive Summary

Mr. Kek is a from-scratch TypeScript rewrite of an existing Node.js Telegram bot that implements a virtual "kek" currency game for a closed four-person friend group. The core loop is simple: keyword triggers award or revoke "keks" between members, and a leaderboard tracks who is funniest. The rewrite's primary mandate is not new features — it is correctness: four verified bugs in the original (negative balances from a wrong-variable check, broken leaderboard sort, no-op reset, and unguarded concurrent JSON writes) must be fixed and locked in with tests. Security is a hard launch gate: a full MTProto session string was committed to source and must be rotated before any deploy.

The recommended approach is a hexagonal/ports-and-adapters architecture: pure domain logic (balance math, sorting, validation) in an isolated layer with no Telegram or filesystem imports, tested with plain unit tests; a single StateStore chokepoint wrapping all db.json mutations behind an async-mutex; and two independently supervised Telegram adapters (grammY for Bot API, GramJS for the MTProto user account). The stack upgrade is clear: switch from telegraf (maintainer-declared "no future") to grammY, pin TypeScript to 5.9 (not the brand-new 6.0), use lowdb v7 with async-mutex for safe JSON writes, and use tsx + vitest for developer tooling.

The key risk is the MTProto user account: automating a real Telegram account carries a ToS ban risk, and any network failure in the user client must not take down the core give/revoke loop. The casino feature (the only reason the user client exists) is the highest-complexity, highest-risk piece and is explicitly deferred to v2. Phase sequencing should follow the architecture's inside-out dependency order: pure domain first, then config/secrets, then persistence, then Bot API handlers — leaving the MTProto user client and casino for a later phase after the core is solid.

## Key Findings

### Recommended Stack

Switch from telegraf to **grammY** (written by telegraf's original author as its TypeScript-native successor; telegraf's maintainer has publicly stated it has no future). For the MTProto user client, keep **GramJS** for the initial rewrite (same library as the original — lowest porting risk on the four raw API calls the casino needs), with mtcute documented as the future migration target if GramJS's slowing release cadence becomes a problem.

**Core technologies:**
- **grammY ^1.44** — Bot API client — TypeScript-native, actively maintained, best-in-class docs; replaces telegraf
- **GramJS (`telegram`) ^2.26** — MTProto user-account client — lowest porting risk from original; all needed raw calls proven
- **lowdb ^7.0** — JSON-file state store — native ESM + TS types; matches PROJECT.md no-DB constraint
- **async-mutex ^0.5** — serialized write queue — in-process Mutex around every read-modify-write; directly fixes SPEC §11.7
- **TypeScript 5.9 (pinned, not 6.0)** — type safety on balance/state logic; ecosystem not validated against 6.0 yet
- **Node.js 22 (active LTS)** — replaces EOL nodejs14; native fetch, stable through 2027
- **tsx + vitest** — dev runner and test runner; ESM-native, zero-config for this stack
- **Docker multi-stage on node:22-bookworm-slim** — avoid Alpine (GramJS native crypto + musl = silent failures)

### Expected Features

The genre minimum (table stakes) maps 1:1 to the PROJECT.md Active requirements — everything in v1 is something the game cannot exist without.

**Must have (v1 — table stakes):**
- Atomic/serialized balance writes — foundation; without it all state is unreliable
- Give kek via keyword triggers — the core verb; 1 kek giver to author, public confirmation
- Revoke kek (некек) — undo last award; restores both balances
- Self-kek forbidden — the one universal anti-abuse rule
- Per-member balance + 100-kek seed (/start) — the economy unit
- Leaderboard /stats with correct descending sort (fix SPEC §11.3 boolean comparator)
- Admin /start//reset (LUX-only, fix §11.4 map-without-assign no-op)
- /help, /commands, /keys — keyword game requires discoverability
- All secrets from env (BOT_TOKEN, API credentials, session string, chat IDs)

**Should have (v1.x — differentiators):**
- Triple-kek bonus — cheap (reuses kekedUsers tracking already built for v1); add after core loop is validated
- Expanded mocking titles — light flavor on top of /stats

**Defer (v2+):**
- Kek-casino — hard dependency on MTProto user client + relay channel; highest complexity; defer until core is solid
- Native emoji reaction awarding — requires bot to be chat admin; additive, not a replacement; no v1 need
- Streaks / daily allowance / 30-day stats — changes economic model; out of scope for a closed friend group

### Architecture Approach

Use a hexagonal/ports-and-adapters layout. The domain layer (domain/) is pure: no Telegram types, no I/O, no await. All game rules (give/revoke, balance invariants, self-kek guard, leaderboard sort, reset) live here and are directly unit-testable with plain objects. A single StateStore class owns the async-mutex Mutex and the only path to db.json — handlers never touch the file. Two adapters (grammY Bot API, GramJS MTProto) are supervised independently so a user-client failure degrades only the casino, not the core bot.

**Major components:**
1. **Composition root (main.ts)** — load config, build store, build both clients, wire handlers, start clients (non-blocking: do NOT await bot.launch()), install SIGINT/SIGTERM
2. **Domain layer (domain/)** — pure functions: giveKek, revokeKek, leaderboard, triggers, state types; zero external imports
3. **Persistence (StateStore)** — single chokepoint: update(mutator) acquires mutex, calls domain mutator, atomically writes db.json; getState() is lock-free snapshot
4. **Bot API adapter (telegram/bot-client.ts)** — grammY Bot, handler registration; thin glue only
5. **MTProto adapter (telegram/user-client.ts)** — GramJS, narrow typed interface (searchMedia, sendMediaToRelay); only the casino handler depends on it
6. **Config (config/env.ts + config/participants.ts)** — env secrets validated at boot (throws if missing); hardcoded participant table kept separate from secrets

### Critical Pitfalls

1. **MTProto StringSession committed to source** (SPEC §3/§11.1) — load session only from SESSION_KEY env var; rotate the already-leaked key before any deploy; add secret scanning (gitleaks) to CI
2. **Balance guard on wrong variable → negative balances** (SPEC §11.2) — TypeScript strict with no any on user types makes number.kekNumber a compile error; single canAfford(user, cost) helper; boundary test at 0-balance
3. **Concurrent writes to db.json → lost updates / corruption** (SPEC §11.7) — every mutation through StateStore.update + async-mutex; atomic temp-file rename; never hold lock across network calls
4. **bot.launch() never resolves → user client never starts** — do not await bot.launch(); start user client first, then call bot.launch(callback) non-blocking; verify both clients log "connected"
5. **Casino FLOOD_WAIT mishandling** — catch FloodWaitError, sleep full .seconds, retry once; cache the media-id list with TTL; never tight-retry (escalates to account lock)

## Implications for Roadmap

Architecture research provides an explicit inside-out build order grounded in dependency analysis. Follow it.

### Phase 1: Foundation — Secrets, Config, and Dual-Client Bootstrap
**Rationale:** Security is a hard launch gate (leaked session must be rotated before any code runs in production); config validation at boot prevents all "missing env" runtime surprises; dual-client lifecycle (the bot.launch() non-await footgun) must be right from the start.
**Delivers:** Project skeleton with working dual-client startup, all secrets from env, SIGINT/SIGTERM shutdown, structured logging.
**Addresses:** All credentials and chat IDs from env (PROJECT.md Active); session rotation; admin account provisioning.
**Avoids:** Pitfall 1 (session leak), Pitfall 3 (personal account used for user client), Pitfall 8 (startup hang).

### Phase 2: Domain Core + Persistence
**Rationale:** The four SPEC §11 bugs (§11.2, §11.3, §11.4, §11.7) are pure-logic and write-safety bugs. Fixing them in isolation before any Telegram wiring makes them unit-testable with plain objects and no mocks. This is the most important testability decision in the architecture.
**Delivers:** Pure domain functions (giveKek, revokeKek, leaderboard, resetStats, triggers) with full unit tests; StateStore with mutex + atomic write tested for concurrency.
**Uses:** lowdb v7, async-mutex, TypeScript strict types, vitest.
**Implements:** Domain layer + Persistence layer of the hexagonal architecture.
**Avoids:** Pitfall 2 (negative balances), Pitfall 5 (lost updates), Pitfall 6 (sort comparator), Pitfall 7 (reset no-op).

### Phase 3: Bot API Handlers — Core Game Loop
**Rationale:** With the domain and persistence validated, wiring grammY handlers is straightforward Telegram-specific glue. This phase completes the MVP: the give/revoke/balance/leaderboard loop must work reliably before any flavor features are added.
**Delivers:** Live give kek, revoke kek, leaderboard /stats, admin /start//reset, /help//commands//keys — the full v1 feature set.
**Uses:** grammY ^1.44, calls pure domain functions through StateStore.
**Implements:** Bot API adapter + Application/handlers layers.
**Avoids:** Anti-pattern of game logic inside handlers; self-kek guard tested in domain not re-implemented in handler.

### Phase 4: Deployment and Hardening
**Rationale:** Correctness means nothing if state is lost on container restart or the process dies silently. Docker volume mount, graceful shutdown, and secret scanning in CI close the last launch gates.
**Delivers:** Docker multi-stage image (node:22-bookworm-slim), db.json on a mounted volume, SIGTERM flush verified, gitleaks CI check, env-based deployment runbook.
**Avoids:** db.json lost on container restart; graceful shutdown write loss; future session re-commit.

### Phase 5: Triple-Kek Bonus (v1.x)
**Rationale:** Cheap feature (reuses kekedUsers per-message dedup already built in phases 2/3); delivers a differentiator without new infrastructure. Only build after core loop is validated in production.
**Delivers:** Triple-kek threshold detection, special celebration message, kekedUsers dedup by giver.

### Phase 6: Kek-Casino (v2)
**Rationale:** Highest complexity, only feature requiring the MTProto user client's raw API calls. Deferred per PROJECT.md. Build only after the core is rock-solid and a dedicated (expendable) Telegram account is provisioned.
**Delivers:** Casino trigger, 1-kek charge, messages.Search media pipeline, relay-channel forward, refund-on-error.
**Uses:** GramJS telegram ^2.26 user-client adapter (built in Phase 1, expanded here).
**Avoids:** Pitfall 4 (FLOOD_WAIT handling), Pitfall 3 (ToS ban — dedicated account, minimal user-client surface).

### Phase Ordering Rationale

- Phases 1 and 2 are independent of live Telegram: config validates at boot; domain and persistence have no grammY or GramJS imports. This enables fast, reliable unit testing before any live bot work.
- Phase 3 is the MVP payoff — it consumes phases 1 and 2 cleanly. All SPEC §11 bugs are already fixed and tested before the first Telegram message is processed.
- Phase 4 closes deployment gaps that would make phases 1–3 meaningless in production.
- Phases 5 and 6 are additive flavor; sequencing them after validation prevents building on an unstable foundation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (Casino):** Raw MTProto API shapes (messages.Search pagination, media types, SendMedia via relay channel) are the least-standardized part of the stack. GramJS raw invoke call signatures, InputPeerChannel construction, and FloodWaitError handling need phase-specific research. Flag for `/gsd-plan-phase --research-phase 6`.

Phases with standard patterns (skip research-phase):
- **Phase 1:** grammY startup and env loading are well-documented standard patterns.
- **Phase 2:** Pure functions + async-mutex + lowdb are well-documented; concurrency test patterns are standard.
- **Phase 3:** grammY handler registration is standard; previous-message detection is documented in SPEC §8.1.1.
- **Phase 4:** Multi-stage Docker + volume mount is standard; nothing novel.
- **Phase 5:** Triple-kek is pure threshold logic on existing data structures; no research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry live-checked 2026-06-22; grammY vs telegraf from official maintainer statement; GramJS vs mtcute from npm dates + docs |
| Features | MEDIUM | Table stakes verified against genre + SPEC; differentiator/defer split from PROJECT.md decisions; genre competitors are low-confidence comparisons |
| Architecture | HIGH | Hexagonal pattern grounded in SPEC §11 bugs (authoritative); async-mutex pattern from library docs; telegraf bot.launch() footgun from tracked issues |
| Pitfalls | HIGH (SPEC bugs) / MEDIUM (session/flood) / LOW (ToS ban) | SPEC §11 bugs directly documented in source; flood/session from gram.js.org docs; ToS ban risk is anecdotal |

**Overall confidence:** HIGH for v1 work (phases 1–4); MEDIUM for casino phase (phase 6 raw API shapes).

### Gaps to Address

- **GramJS maintenance pace:** Last publish Feb 2025. If a TL-layer break occurs during development, the casino phase may need to pivot to mtcute. Flag this decision at the start of Phase 6 — both options are valid and the choice is contained to the MTProto adapter.
- **Previous-message detection without a reply:** SPEC §8.1.1 says to walk history skipping service/bot messages. The exact GramJS GetHistory call shape and bot-message author extraction pattern need verification during Phase 3 planning.
- **Session string generation workflow:** A one-off input-based script to generate the StringSession is a devDependency, not runtime — the runbook for this must be documented in Phase 1 to avoid a blocker.
- **Casino relay channel mechanics:** How the bot forwards media from the source chat to the relay channel and back is described in SPEC §8.3 but the exact GramJS call sequence needs validation in Phase 6 research.

## Sources

### Primary (HIGH confidence)
- SPEC.md (§3, §5, §7–9, §10, §11, §12) — authoritative behavior and verified bug list
- PROJECT.md — scope, constraints, decisions
- npm registry live queries (2026-06-22) — current versions and last-publish dates
- telegraf Discussion #1526 — maintainer "no future" statement
- grammY docs (grammy.dev) — session plugin, filter queries, comparison
- async-mutex, lowdb v7 library docs — serialized write patterns

### Secondary (MEDIUM confidence)
- mtcute docs (mtcute.dev) — raw API, MTProto vs Bot API, FAQ
- GramJS GitHub + gram.js.org — session auth, FloodWaitError, raw invoke
- telegraf GitHub issues #1989/#1749/#1867 — bot.launch() non-resolving behavior
- Telegram Bot API docs — message_reaction update, admin requirements
- grammY Reactions guide — reactor identity in groups vs channels
- Snyk Docker guide — slim vs alpine with native modules

### Tertiary (LOW confidence)
- Telegram KarmaBot, @PlusMinusKarmaBot, Discord Reto, Karma Reborn — genre feature comparison (cannot verify current state)
- ToS ban anecdotal case study — account ban risk (anecdotal)

---
*Research completed: 2026-06-22*
*Ready for roadmap: yes*
