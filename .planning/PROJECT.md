# Mr. Kek (Мистер Кек)

## What This Is

A Telegram group-chat bot for a closed friend group that implements a virtual "kek"
currency game: members award each other "keks" for funny messages, and the bot tracks
every member's balance and a shared leaderboard ("Кеказна") ranking who is the funniest.
This is a from-scratch TypeScript rewrite of an existing Node.js bot, reusing its
reverse-engineered behavior (see `SPEC.md`) while fixing known bugs, removing hardcoded
secrets, and making balance operations safe from races.

## Core Value

Members can reliably give and revoke "keks" on each other's messages and see an accurate
leaderboard — the give/revoke/balance loop must always be correct. Everything else is
flavor on top of that.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Bot connects to Telegram as both a Bot API client (telegraf) and an MTProto user client (GramJS)
- [ ] All secrets (BOT_TOKEN, API_ID, API_HASH, MTProto session string) and the chat ID + casino relay channel ID load from environment variables — never hardcoded
- [ ] Compromised MTProto session key is rotated before any deploy
- [ ] Give kek: trigger words (кек/kek/топкек/topkek/k3k) move 1 kek from giver to message author, with public confirmation
- [ ] Revoke kek (некек/nekek): reverses the giver's last awarded kek and restores balances
- [ ] Self-kek is forbidden
- [ ] `/start` (LUX only) initializes participants with 100 keks each; `/reset` (LUX only) resets all balances; non-admins get the joke refusal
- [ ] `/stats` shows the leaderboard ranked correctly by balance (fixes broken comparator)
- [ ] `/help`, `/commands`, `/keys` informational commands
- [ ] Balance write operations are serialized/atomic so concurrent messages can't corrupt state or race the JSON file
- [ ] Humorous/ironic Russian message tone and the specific participant identities are preserved

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Dynamic / configurable participant list and names — deliberately kept hardcoded because the specific identities (TRUF/Дима, ADD/Эд, LUX/Лукас, KALASH/Андрей) are part of the joke for this one chat
- Multi-chat / per-chat generalization — this bot serves one closed friend group; per-chat scoping adds complexity with no payoff here
- Migration to a relational/hosted database — JSON-file storage with a serialized write queue is sufficient for a small group
- Replacing the dual-client model with Bot-API-only reactions — the user client is needed for kek-casino's media search; keeping it is an accepted tradeoff

## Context

- **Rewrite, not greenfield-from-zero:** `SPEC.md` is a detailed reverse-engineering of the
  original `index.js`/`constants.js`. It is the authoritative behavior reference. The old
  source files have been removed from the working tree.
- **Two Telegram clients by necessity:** the Bot API cannot search channel media history,
  read message history between IDs, list channel participants, or send media from a channel.
  Those needs (chiefly kek-casino) require the MTProto user-account client.
- **Known bugs to fix during rewrite** (from SPEC §11): balance check used the wrong
  variable (`fromUserId.kekNumber` vs `fromUser.kekNumber`) allowing negative balances;
  leaderboard sort comparator returned a boolean; `/reset` mapped users but never assigned
  the result so it did nothing; no concurrency control on `db.json`.
- **Security:** the original hardcoded the MTProto session string in source — full account
  access. This must be removed and the key rotated.
- **Participant identities (hardcoded constants):** TRUF (Дима, 448341870), ADD (Эд,
  337052957), LUX (Лукас, 372958499, **admin**), KALASH (Андрей, 261400005). Bot account
  id MR_KEK_ID = 5362994462.

## Constraints

- **Tech stack**: Node.js 22 + TypeScript 5.9 — grammY for the Bot API client (telegraf is maintainer-declared dead), GramJS for the MTProto user client, lowdb v7 + async-mutex for state, tsx + vitest for tooling
- **Storage**: JSON file (lowdb-style) with a serialized write queue / locking — fix races without DB ops overhead
- **Architecture**: Dual-client (telegraf Bot API + GramJS MTProto user client) — required for casino/media features
- **Deployment**: Docker / VPS, long-running process, env-based config — replaces the old App Engine / Heroku setup
- **Secrets**: All credentials and the session string in env vars only; rotate the leaked key

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js 22 + TypeScript 5.9; grammY over telegraf | Type safety on balance/state logic; telegraf is maintainer-declared dead, grammY is its TS-native successor | — Pending |
| Keep dual-client (Bot + MTProto user) | Casino/media features need user-account capabilities Bot API lacks | — Pending |
| JSON file + serialized write queue | Fix concurrency bugs without adopting a real DB for a small group | — Pending |
| Hardcode participant names, env everything else | Names are part of the joke; secrets/chat IDs must not be in source | — Pending |
| Core kek + leaderboard first; defer triple-kek, casino, tests | Get the give/revoke/balance loop correct before flavor features | — Pending |
| Docker / VPS deploy | Long-running dual-client process; replaces App Engine/Heroku | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-22 after initialization*
