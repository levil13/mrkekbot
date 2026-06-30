# Feature Research

**Domain:** Telegram group-chat "reaction economy" game bot (virtual-currency / points / karma genre)
**Researched:** 2026-06-22
**Confidence:** MEDIUM

> Grounded in the project's actual mechanics (see `SPEC.md` §7–9: kek/nekek triggers, triple-kek, kek-casino, `/start /reset /stats /keys /help`) and corroborated against the broader Telegram/Discord karma-economy bot genre. PROJECT.md pins v1 scope to **core kek give/revoke + leaderboard**; triple-kek and casino are deferred — categorization below sequences accordingly.

## Feature Landscape

### Table Stakes (Users Expect These)

The genre minimum: if any of these is missing, "the game" doesn't exist. Every karma/points bot surveyed (Telegram KarmaBot, @PlusMinusKarmaBot, Discord Reto, Karma Reborn) has all of these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Award points to another member** (give kek) | The core verb of the genre — reply/react/keyword moves 1 unit from giver→author | MEDIUM | SPEC §8.1. Target resolution (reply vs "previous meaningful message") + author detection are the real complexity, not the balance math. **v1 core.** |
| **Revoke / take back the award** (некек) | Mistakes happen; every karma bot supports `-1` / undo. Here it's "undo my last award" | MEDIUM | SPEC §8.2. Needs `lastKekGivenTo` per giver. Edge cases (nothing given yet; recipient at 0) are part of the spec's humor. **v1 core.** |
| **Per-member balance tracking** | Without a persisted balance there is no economy | LOW | SPEC §5. Each user has `kekNumber`, starts at 100. The serialized-write/atomicity requirement (PROJECT.md) is what makes this non-trivial, not the data shape. **v1 core.** |
| **Leaderboard / ranking** (`/stats`, "Кеказна") | The payoff loop — "who is funniest." Universal across the genre | LOW | SPEC §9. Must fix the broken comparator (SPEC §11.3 — returned boolean). **v1 core.** |
| **No self-awarding (anti-abuse)** | The single most universal anti-abuse rule in the genre; trivially gamed otherwise | LOW | SPEC §8.1.3. Forbid kek on own message. **v1 core.** |
| **Admin init / reset** (`/start`, `/reset`, LUX-only) | Someone must seed balances and reset a season; gating prevents griefing | LOW–MEDIUM | SPEC §7. Must fix `/reset` no-op bug (SPEC §11.4). Authorization gate (LUX only) + joke refusal for others. **v1 core.** |
| **Help / discoverability** (`/help`, `/commands`, `/keys`) | Users can't play a keyword game they can't see the keywords for | LOW | SPEC §7. `/keys` is genre-specific here because awards are keyword-triggered rather than a documented `+1`. **v1 core.** |
| **Public confirmation of an award** | Social recognition is the reward; a silent points change defeats the purpose | LOW | SPEC §8.1.4 — bot posts a public notice. Tone (rude/ironic Russian) is itself product per PROJECT.md. **v1 core.** |
| **Starting allowance / budget per member** | A spendable budget (100 keks) is what makes awards cost something and the economy zero-sum-ish | LOW | SPEC §5 (start = 100). Giving costs the giver 1; this scarcity is what makes the leaderboard meaningful. **v1 core.** |

### Differentiators (Competitive Advantage)

The "fun extras." These distinguish this bot from a plain +1 karma counter. All are **deferred past v1** per PROJECT.md.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Triple-kek bonus event** | A message that earns 3 keks from 3 distinct users triggers a special celebration + consumes the record — a mini "jackpot" that rewards consensus-funny posts | MEDIUM | SPEC §8.1.5. Depends on per-message `kekedUsers` tracking (dedup by giver) which v1 already builds for award accounting. Mostly messaging + threshold logic on top of existing give-kek. **v1.x candidate.** |
| **Kek-casino (media gamble)** | Spend 1 kek to surface a random photo/video from chat history — a slot-machine-style nostalgia/meme generator that gives keks a sink | HIGH | SPEC §8.3. **Hard dependency on the MTProto user client** (`messages.Search` over channel history + relay-channel forward); Bot API cannot do this. Highest-risk, highest-infra feature. **v2 candidate.** |
| **Streaks** (genre-common, not in SPEC) | Reward consistent daily participation; drives retention. Seen in DiscordStreak, daily-karma bots | MEDIUM | Not in current spec. Would add a daily-activity dimension to the economy. Speculative — only if the group wants more game loop. **Future / out of scope unless requested.** |
| **Daily allowance / refill** (genre-common, not in SPEC) | Top up everyone's spendable budget each day so the economy doesn't grind to a halt | MEDIUM | Not in SPEC; this bot uses a one-time 100-kek seed + reset instead. A daily refill would change the economic model. **Future consideration only.** |
| **Achievements / titles** | SPEC §9 already hints at this: LUX gets an honorific title, others get mocking titles | LOW | Partial form already exists in `/stats` titles. Could expand to milestone badges, but risks scope creep. **v1.x flavor at most.** |
| **All-time vs recent (30-day) stats** | Karma Reborn separates all-time received from last-30-days and tracks quality-of-giving | MEDIUM | Would require timestamped award history. The spec only keeps current balances + a 24h `messagesWithKek` window. **Future — needs a history model that v1 deliberately omits.** |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Dynamic / multi-chat participant config** | "Make it reusable for other groups" | PROJECT.md: the specific identities (TRUF/Дима, ADD/Эд, LUX, KALASH/Андрей) are part of the joke; per-chat scoping adds complexity with zero payoff for a single closed group | Keep participants hardcoded; env only for secrets + chat/relay IDs |
| **Negative-karma / downvote-on-others** | Symmetry with `+1/-1` karma bots | Already covered by некек (revoke *your own* award). A "subtract from someone else" verb invites harassment and griefing in a small friend chat, and breaks the zero-sum giver-pays model | Keep некек = undo-my-last-award only |
| **Migration to a hosted/relational DB** | "JSON won't scale / races are scary" | PROJECT.md: a small closed group doesn't need it; adds ops + deploy surface. The real bug was missing concurrency control, not the storage engine | JSON file + serialized write queue / async-mutex (fixes SPEC §11.7 races without a DB) |
| **Replace dual-client with Bot-API-only native reactions** | Bot API 7.0 (Jan 2024) added `message_reaction` updates; the user client is a security/ops liability | PROJECT.md accepts the user client because **kek-casino needs MTProto media search** — Bot API still can't search channel media history. Dropping the user client kills the casino. Also: native reactions require the bot be a **chat admin** + `allowed_updates` enabled, and only yield the reactor's identity in groups (not channels) | Keep keyword triggers + dual client for v1/casino. *Optionally* layer native-reaction awarding later as an **additive** input path, not a replacement (see mechanics note below) |
| **Unbounded message-award history** | "Track everything for richer stats" | SPEC §8.1.6 deliberately prunes `messagesWithKek` older than 24h to bound state. Keeping all history bloats the JSON file and worsens the very race/size problems being fixed | Keep the 24h prune; if richer stats are wanted later, add a separate append-only log, don't bloat live state |
| **Letting balances go negative** | (Not requested — it's the existing bug, SPEC §11.2) | Wrong-variable check (`fromUserId.kekNumber`) let givers spend keks they don't have, breaking the zero-sum economy | Fix to check `fromUser.kekNumber`; reject award when giver balance is 0 |

### How "react to award points" works on Telegram (mechanics note)

This genre's core verb can be wired three ways. Grounded in SPEC + current Bot API:

1. **Keyword triggers (what this bot uses).** Any message normalized to lowercase + whitespace-stripped and exact-matched against trigger lists (`кек/kek/топкек/topkek/k3k` to give; `некек/nekek` to revoke; casino words). Target = the replied-to message, else the "previous meaningful message." Works with a plain Bot API bot, no admin rights, no extra Telegram permissions. **Downside:** target resolution is fuzzy when not a reply, and author-of-bot-messages must be parsed from `(<id>)` text (SPEC §8.1.2). This is the v1 path. *(Confidence: HIGH — directly from SPEC.)*
2. **Reply-with-`+1`** (classic karma bots, e.g. KarmaBot `/send`, `+1`/`-1`). Same Bot-API-only footprint as keywords, with unambiguous targeting (always a reply). Effectively a stricter sub-case of the keyword approach. *(Confidence: MEDIUM — genre-standard.)*
3. **Native emoji reactions** (`message_reaction` update, Bot API 7.0+, Jan 2024). The bot is notified when a user adds/removes a reaction and **learns which user reacted** — *but only* if (a) the bot is a **chat administrator** and (b) `allowed_updates` includes `message_reaction`. Channels give only anonymous counts; private groups give the reactor identity. This is newly viable since the original bot was written (SPEC §3 notes reactions were commented out; SPEC §12 suggests reconsidering). It does **not** replace the user client, because casino media-search still needs MTProto. *(Confidence: MEDIUM — corroborated across official Bot API docs + grammY docs.)*

**Recommendation:** v1 keeps keyword triggers (no admin requirement, matches existing behavior/tests). Native reactions are a *future additive* awarding path, not a v1 requirement and not a replacement for the dual client.

## Feature Dependencies

```
[Per-member balance tracking] ──requires──> [Serialized/atomic write queue]
        │                                         (fixes SPEC §11.7 races)
        ├──required by──> [Give kek]
        │                     ├──required by──> [Revoke kek (некек)]  (needs lastKekGivenTo)
        │                     ├──required by──> [Triple-kek bonus]     (needs kekedUsers per message)
        │                     └──required by──> [Kek-casino]           (entry fee debits balance)
        │
        ├──required by──> [Leaderboard /stats]
        └──required by──> [Admin /start (seed 100)] ──required by──> ALL gameplay

[Give kek] ──requires──> [Target resolution: reply OR previous-meaningful-message]
[Give kek] ──requires──> [Author detection] ──includes──> [self-award guard]

[Kek-casino] ══requires══> [MTProto user client (GramJS)]   ← HARD dependency, Bot API cannot do media search
        └──requires──> [Relay channel ID config]

[Native-reaction awarding] ──requires──> [Bot is chat admin] + [allowed_updates: message_reaction]
        └──conflicts/redundant-with──> [Keyword triggers]  (two input paths for the same verb; keep one canonical)
```

### Dependency Notes

- **Everything requires the atomic write queue.** The four reverse-engineered bugs (SPEC §11) all stem from unsafe state handling; the balance layer must be correct and serialized *before* any gameplay is reliable. This is the true v1 foundation.
- **All gameplay requires `/start` seeding.** Casino explicitly guards on initialization (SPEC §8.3.1); the same precondition applies to give/revoke meaningfully (balances must exist).
- **Triple-kek enhances Give kek and reuses its data.** It only needs threshold logic + messaging on top of the `kekedUsers` per-message dedup list that v1 already maintains — cheap to add later, which is why it's a clean v1.x.
- **Kek-casino has a hard infra dependency on the MTProto user client.** This is why PROJECT.md keeps the dual-client model despite its security cost. Casino cannot be built on Bot API alone. Sequence it last.
- **Native reactions and keyword triggers are redundant input paths.** Pick keywords as canonical for v1; if reactions are added, decide whether they supplement or replace — don't run both as primary or balances double-count.

## MVP Definition

### Launch With (v1)

Minimum viable "the game exists." Maps 1:1 to PROJECT.md Active requirements.

- [ ] **Atomic/serialized balance writes** — foundation; without it state corrupts (SPEC §11.7)
- [ ] **Give kek** via trigger words, 1 kek giver→author, public confirmation — the core verb
- [ ] **Revoke kek (некек)** — undo last award, restore balances — the core safety valve
- [ ] **Self-award forbidden** — the one indispensable anti-abuse rule
- [ ] **Per-member balance + 100-kek seed** — the economy unit
- [ ] **Leaderboard `/stats`** with correct sort (fix SPEC §11.3) — the payoff
- [ ] **Admin `/start` / `/reset`** (LUX-only, fix §11.4 no-op) — seed + season reset
- [ ] **`/help` / `/commands` / `/keys`** — discoverability of a keyword game
- [ ] **Secrets in env + session key rotated** — security precondition (not a feature, but a launch gate)

### Add After Validation (v1.x)

- [ ] **Triple-kek bonus** — trigger: core give/revoke loop is correct and players want more game. Cheap (reuses `kekedUsers`).
- [ ] **Expanded titles / light achievements** — trigger: `/stats` is in use and the group enjoys the mocking titles.

### Future Consideration (v2+)

- [ ] **Kek-casino** — defer: highest complexity + the only feature needing MTProto media search + relay channel. Build only after core is rock-solid and the user-client security model is hardened.
- [ ] **Native-reaction awarding path** — defer: requires making the bot a chat admin + `allowed_updates`; additive, not required. Only if the group prefers reacting over typing keywords.
- [ ] **Streaks / daily allowance / 30-day stats** — defer: changes the economic model (currently one-time seed + reset). Only if retention/engagement becomes a goal. Likely out of scope for a closed friend chat.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Atomic/serialized balance writes | HIGH | MEDIUM | P1 |
| Give kek (keyword trigger) | HIGH | MEDIUM | P1 |
| Revoke kek (некек) | HIGH | MEDIUM | P1 |
| Self-award guard | HIGH | LOW | P1 |
| Balance + 100-kek seed | HIGH | LOW | P1 |
| Leaderboard `/stats` (fixed sort) | HIGH | LOW | P1 |
| Admin `/start` / `/reset` (fixed) | HIGH | MEDIUM | P1 |
| `/help` / `/commands` / `/keys` | MEDIUM | LOW | P1 |
| Public award confirmation | MEDIUM | LOW | P1 |
| Triple-kek bonus | MEDIUM | MEDIUM | P2 |
| Expanded titles / achievements | LOW | LOW | P2 |
| Kek-casino | MEDIUM | HIGH | P3 |
| Native-reaction awarding | MEDIUM | MEDIUM | P3 |
| Streaks / daily allowance / 30-day stats | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch (v1 — the game)
- P2: Should have, add when possible (v1.x — the deferred fun extras: triple-kek)
- P3: Nice to have, future consideration (v2+ — casino, reactions, retention loops)

## Competitor Feature Analysis

| Feature | Telegram KarmaBot / @PlusMinusKarmaBot | Discord Reto / Karma Reborn | Our Approach (Mr. Kek) |
|---------|----------------------------------------|------------------------------|-------------------------|
| Award mechanic | Reply with `+1`/`-1`; `/send` to transfer | React with 💗/⭐ emoji; reaction-driven | Keyword triggers (`кек`, etc.) on reply or previous message; native reactions deferred |
| Revoke | `-1` (subtract from others) | React-remove / `-1` | некек = undo *your own last award* (no downvoting others) |
| Leaderboard | Web dashboard + in-chat top users | All-time + last-30-days, global + server | In-chat `/stats` "Кеказна", current balances + comic titles |
| Budget model | Karma is uncapped/earned | Karma earned, sometimes daily-claimable | Zero-sum: 100-kek seed, giving costs the giver |
| Bonus/jackpot | — (rare) | Starboard "best of" | Triple-kek (3 distinct givers → celebration) |
| Gamble/sink | — | — | Kek-casino (spend 1 kek for random media) — genre-unusual |
| Anti-abuse | Self-vote blocked; cooldowns | Self-react blocked | Self-kek blocked; balance can't go negative (fix) |
| Tone | Neutral/professional | Neutral/playful | Deliberately rude/ironic Russian — tone is product |

**Genre read:** Mr. Kek is a standard karma/reputation bot at its core (give/revoke/balance/leaderboard/no-self-vote) with two genre-unusual twists — the **triple-kek jackpot** and the **media casino sink** — plus a strong comedic-tone identity. The casino is the genuine differentiator and also the only piece forcing the dual-client architecture.

## Sources

- [Telegram Bot API — official docs](https://core.telegram.org/bots/api) (reactions, `setMessageReaction`, `message_reaction` update) — MEDIUM
- [Telegram API — Message reactions](https://core.telegram.org/api/reactions) — MEDIUM
- [grammY — Reactions guide](https://grammy.dev/guide/reactions) (admin + `allowed_updates` requirement, reactor identity in groups) — MEDIUM (cross-checked vs official docs)
- [WilliamsMata/karma_bot (Telegram, NestJS/TS)](https://github.com/WilliamsMata/karma_bot) — leaderboards, history, reply-based — LOW
- [KarmaBot for Telegram](https://karmabot.chat/telegram/) — `+1/-1`, `/send`, dashboard, milestones — LOW
- [Reto (Discord karma/starboard)](https://retobot.com/) — emoji-react awarding, leaderboard, "best of" — LOW
- Karma Reborn (Discord) — all-time vs 30-day, quality-of-giving — LOW
- DiscordStreak — streak leaderboards — LOW
- Project `SPEC.md` (§5–9, §11–12) and `.planning/PROJECT.md` — authoritative behavior reference — HIGH

---
*Feature research for: Telegram group-chat reaction-economy game bot*
*Researched: 2026-06-22*
