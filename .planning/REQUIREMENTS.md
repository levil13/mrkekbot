# Requirements: Mr. Kek (Мистер Кек)

**Defined:** 2026-06-22
**Core Value:** Members can reliably give and revoke "keks" on each other's messages and see an accurate leaderboard — the give/revoke/balance loop must always be correct.

## v1 Requirements

Requirements for the initial release. Scope is deliberately **core kek give/revoke + leaderboard** (the foundation); triple-kek and kek-casino are deferred to v2. Each maps to roadmap phases.

### Configuration & Secrets

- [x] **CFG-01**: All secrets (BOT_TOKEN, API_ID, API_HASH, MTProto session string) load from environment variables — never hardcoded in source
- [x] **CFG-02**: The main chat ID and the casino relay channel ID load from environment variables
- [x] **CFG-03**: The compromised MTProto session key is rotated, and a runbook documents how to generate a fresh StringSession
- [x] **CFG-04**: Participant identities (TRUF/Дима, ADD/Эд, LUX/Лукас, KALASH/Андрей), the admin (LUX), and the bot account id are defined as hardcoded constants
- [x] **CFG-05**: The bot starts the grammY Bot API client and the GramJS MTProto user client in one process with correct non-blocking startup, and shuts down gracefully on SIGINT/SIGTERM

### Persistence

- [ ] **DATA-01**: Game state (per-user balances, kek'd-message records) persists to a JSON file and survives process restarts
- [ ] **DATA-02**: All state mutations are serialized through a single guarded chokepoint (async mutex) so concurrent messages cannot lose updates or corrupt the file (fixes SPEC §11.7)
- [ ] **DATA-03**: Kek'd-message records older than 24h are pruned to keep state bounded

### Kek Economy

- [ ] **KEK-01**: A kek trigger word (кек / kek / топкек / topkek / k3k) awards 1 kek from the giver to the target message's author (−1 giver, +1 author)
- [ ] **KEK-02**: The target message is the replied-to message, or the previous meaningful message in the chat when the trigger is not a reply (skipping service/bot messages)
- [ ] **KEK-03**: When the target author is the bot, the real author id is parsed from the message text pattern `(<number>)`; if not found, the kek redirects to LUX with a joke
- [ ] **KEK-04**: A user cannot kek their own message (self-kek forbidden)
- [ ] **KEK-05**: A giver whose balance is 0 cannot award a kek (fixes SPEC §11.2 negative-balance bug)
- [ ] **KEK-06**: Each awarded kek posts a public confirmation message in the chat, in the established humorous/ironic Russian tone
- [ ] **KEK-07**: A nekek trigger (некек / nekek) revokes the giver's most recent awarded kek and restores both balances (+1 giver, −1 recipient)
- [ ] **KEK-08**: Revoke handles edge cases with the appropriate joke responses ("you haven't given anyone a kek yet"; "recipient has 0 keks — can't take it back")

### Commands

- [ ] **CMD-01**: `/start` (LUX only) loads participants, seeds everyone with 100 keks, and posts a welcome message plus current stats; non-admins get the joke refusal
- [ ] **CMD-02**: `/reset` (LUX only) resets all balances to 100 and the reset actually persists (fixes SPEC §11.4 no-op bug); non-admins refused
- [ ] **CMD-03**: `/stats` shows the leaderboard ("Кеказна") ranked correctly in descending balance order (fixes SPEC §11.3 boolean-comparator bug), with the LUX honorific and mocking titles for others
- [ ] **CMD-04**: `/help` and `/commands` list the available commands
- [ ] **CMD-05**: `/keys` lists the trigger words (give / revoke / casino)

## v2 Requirements

Deferred to a future release. Tracked but not in the current roadmap.

### Triple-Kek

- **TRIPLE-01**: When a message accumulates 3 keks from 3 distinct users, the bot posts a special congratulation to the author and consumes the record

### Kek-Casino

- **CASINO-01**: `/kekcasino` (and the casino trigger words) costs 1 kek, surfaces a random photo/video from chat history via the MTProto user client, relays it through the relay channel, and copies it into the chat
- **CASINO-02**: On any casino error, the spent kek is refunded and an error message is shown
- **CASINO-03**: Casino requires prior `/start` initialization
- **CASINO-04**: MTProto FLOOD_WAIT and rate-limit errors are handled with backoff (never tight-retry)

### Quality

- **TEST-01**: Automated test suite (vitest) covering give/revoke/balance/leaderboard logic and the SPEC §11 edge cases
- **TEST-02**: Concurrency stress test asserting the serialized write queue preserves the balance-conservation invariant

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Dynamic / multi-chat participant config | Specific identities are part of the joke for one closed group; per-chat scoping adds complexity with no payoff |
| Downvote / subtract-from-others verb | Invites harassment in a small chat and breaks the zero-sum giver-pays model; некек (undo-my-last) is the only revoke |
| Hosted / relational database | A small closed group doesn't need it; the real bug was missing concurrency control, not the storage engine |
| Bot-API-only (drop the user client) | kek-casino needs MTProto media search the Bot API can't do; dropping the user client kills the casino |
| Negative balances | The existing SPEC §11.2 bug — fixed by KEK-05, not a feature |
| Unbounded award history | SPEC §8.1.6 prunes >24h deliberately; keeping all history bloats state and worsens the race/size problems being fixed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFG-01 | Phase 1 | Complete |
| CFG-02 | Phase 1 | Complete |
| CFG-03 | Phase 1 | Complete |
| CFG-04 | Phase 1 | Complete |
| CFG-05 | Phase 1 | Complete |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| KEK-01 | Phase 3 | Pending |
| KEK-02 | Phase 3 | Pending |
| KEK-03 | Phase 3 | Pending |
| KEK-04 | Phase 3 | Pending |
| KEK-05 | Phase 3 | Pending |
| KEK-06 | Phase 3 | Pending |
| KEK-07 | Phase 3 | Pending |
| KEK-08 | Phase 3 | Pending |
| CMD-01 | Phase 3 | Pending |
| CMD-02 | Phase 3 | Pending |
| CMD-03 | Phase 3 | Pending |
| CMD-04 | Phase 3 | Pending |
| CMD-05 | Phase 3 | Pending |

**Coverage:**

- v1 requirements: 21 total
- Mapped to phases: 21 (Phase 1: 5, Phase 2: 3, Phase 3: 13)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-22*
*Last updated: 2026-06-22 after roadmap creation (traceability populated)*
