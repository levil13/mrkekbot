# Roadmap: Mr. Kek (Мистер Кек)

## Overview

A from-scratch TypeScript rewrite of an existing Telegram kek-currency bot for a closed
friend group. The journey is correctness-first and inside-out: first lock down secrets and
stand up the dual-client process so nothing leaks and the bot boots cleanly (Phase 1); then
build and unit-test the pure game logic plus a serialized-write JSON store where all four
SPEC §11 bugs are fixed in isolation (Phase 2); finally wire the validated domain to live
grammY handlers so members can actually give, revoke, and see the leaderboard in the chat
(Phase 3). The casino (the only consumer of the MTProto user client) is explicitly v2 and
out of this roadmap — but the user client is bootstrapped in Phase 1 because v1 still needs
it available for target resolution.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation — Secrets, Config & Dual-Client Bootstrap** - Leak rotated, all config from env, both clients boot and shut down cleanly (completed 2026-06-25)
- [ ] **Phase 2: Domain Core + Serialized Persistence** - Pure, unit-tested game logic and a mutex-guarded JSON store; all four SPEC §11 bugs fixed
- [ ] **Phase 3: Live Game Loop — Give/Revoke + Commands** - Members can give/revoke keks and read a correctly ranked leaderboard in the chat

## Phase Details

### Phase 1: Foundation — Secrets, Config & Dual-Client Bootstrap

**Goal**: The bot is a single process that loads every secret and id from the environment, rotates the leaked session, and starts both the grammY Bot API client and the GramJS MTProto user client without hanging, shutting both down gracefully on signal.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04, CFG-05
**Success Criteria** (what must be TRUE):

  1. With env vars set, the process boots and logs both clients connected; with a required secret or chat id missing it refuses to start and names what is missing
  2. No secret (BOT_TOKEN, API_ID, API_HASH, session string, chat id, relay channel id) appears anywhere in source — all come from the environment
  3. The compromised MTProto session is rotated and a runbook documents how to generate a fresh StringSession
  4. Participant identities (TRUF/Дима, ADD/Эд, LUX/Лукас as admin, KALASH/Андрей) and the bot account id are defined as hardcoded constants
  5. Sending SIGINT or SIGTERM stops both clients cleanly without a hung process

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 1: ESM scaffold + fail-fast env config loader + hardcoded participant constants + redacting logger (CFG-01/02/04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Wave 2: dual-client composition root (non-blocking boot, both clients, graceful force-exit shutdown) + session-rotation login helper & runbook + README/Doppler setup (CFG-01/03/05)

### Phase 2: Domain Core + Serialized Persistence

**Goal**: All game rules and state live in a pure, unit-tested domain layer behind a single mutex-guarded JSON store, with the four verified SPEC §11 bugs fixed and locked in before any Telegram code touches them.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):

  1. Game state (balances, kek'd-message records) persists to a JSON file and survives a process restart
  2. Concurrent state mutations run through one async-mutex chokepoint and a stress test shows no lost updates or file corruption (fixes SPEC §11.7)
  3. Kek'd-message records older than 24h are pruned so state stays bounded
  4. Domain functions reject a 0-balance giver, sort the leaderboard correctly descending, and actually persist a reset — verified by unit tests for SPEC §11.2, §11.3 and §11.4

**Plans**: TBD

Plans:

- [ ] 02-01: Pure domain layer (giveKek, revokeKek, leaderboard, resetStats, triggers, types) with unit tests for the §11.2/§11.3/§11.4 bug fixes
- [ ] 02-02: StateStore — lowdb JSON persistence, async-mutex serialized writes, 24h pruning, concurrency stress test

### Phase 3: Live Game Loop — Give/Revoke + Commands

**Goal**: Members in the chat can award and revoke keks via trigger words and run every command, with the bot resolving targets correctly, enforcing the anti-abuse rules, and posting confirmations in the established Russian tone.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: KEK-01, KEK-02, KEK-03, KEK-04, KEK-05, KEK-06, KEK-07, KEK-08, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05
**Success Criteria** (what must be TRUE):

  1. A trigger word (кек/kek/топкек/topkek/k3k) moves 1 kek from giver to the target author and posts a public confirmation; the target is the replied-to message or the previous meaningful message, with bot-authored targets resolved via the `(<number>)` pattern (else redirected to LUX with a joke)
  2. Self-kek is refused and a 0-balance giver cannot award a kek (fixes SPEC §11.2)
  3. некек/nekek revokes the giver's most recent award, restores both balances, and gives the right joke for the "nothing to revoke" and "recipient at 0" edge cases
  4. `/start` and `/reset` (LUX only, with the reset actually persisting) seed/reset balances to 100 and refuse non-admins with the joke; `/stats` shows the correctly ranked leaderboard with honorifics
  5. `/help`, `/commands`, and `/keys` list the commands and trigger words

**Plans**: TBD

Plans:

- [ ] 03-01: Give/revoke handlers — trigger detection, target resolution (reply / previous-meaningful / bot-author parse), self-kek and 0-balance guards, confirmations, некек edge cases
- [ ] 03-02: Command handlers — /start, /reset, /stats (correct sort + titles), /help, /commands, /keys

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation — Secrets, Config & Dual-Client Bootstrap | 2/2 | Complete    | 2026-06-25 |
| 2. Domain Core + Serialized Persistence | 0/2 | Not started | - |
| 3. Live Game Loop — Give/Revoke + Commands | 0/2 | Not started | - |
