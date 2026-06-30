# Pitfalls Research

**Domain:** Dual-client Telegram bot (telegraf Bot API + GramJS MTProto user account) with JSON-file virtual-currency game state
**Researched:** 2026-06-22
**Confidence:** MEDIUM (session/flood findings cross-checked against gram.js.org and core.telegram.org/api/errors; ToS ban-risk is LOW/anecdotal; SPEC §11 bugs are HIGH — directly documented in source)

> This project is a TypeScript rewrite. SPEC §11 is a verified list of bugs in the original code. Several pitfalls below are not hypothetical — they already shipped once. The roadmap's job is to ensure each is closed and *stays* closed under tests.

## Critical Pitfalls

### Pitfall 1: MTProto StringSession committed to source / leaked

**What goes wrong:**
The original `index.js` hardcoded the `StringSession` string in source. A StringSession is a full bearer credential for the **user account** — anyone with it can read all chats, impersonate the user, drain the account, and bypass 2FA. This is not a bot token (revocable via BotFather); it is the human's entire Telegram identity.

**Why it happens:**
GramJS makes it frictionless: you log in interactively once, `console.log(client.session.save())`, then paste the string back into code to avoid re-login. The "paste it into a constant" step is the path of least resistance and silently becomes a committed secret.

**How to avoid:**
- Load the session **only** from `SESSION_KEY` env var; `new StringSession(process.env.SESSION_KEY ?? "")`.
- The leaked key from the old repo is already compromised — **rotate before first deploy**: terminate the old session in Telegram → Settings → Devices, then regenerate a fresh string offline.
- Add a `.gitignore` + a pre-commit/CI secret scan (e.g. gitleaks) so a session string can never be committed again.
- Generate the session with a **dedicated account**, not a personal one (see Pitfall 3).

**Warning signs:**
A long base64-ish string literal in any `.ts`/`.js`/`.env.example`; a session that "just works" in CI without env config; `git log -p` showing a session string in history.

**Phase to address:** Phase 1 (Foundation: config/secrets + dual-client bootstrap). Rotation is a hard gate before any deploy.

---

### Pitfall 2: Balance check on the wrong variable → negative balances (SPEC §11.2)

**What goes wrong:**
`giveKek` checked `fromUserId.kekNumber` instead of `fromUser.kekNumber`. `fromUserId` is a number (the id), so `.kekNumber` is `undefined`, the guard never trips, and a user with 0 keks can keep giving keks indefinitely, going negative. The entire economy is debasable.

**Why it happens:**
Loosely-typed plain JS: `fromUserId` and `fromUser` are near-identical names, and reading `.kekNumber` off a number returns `undefined` rather than throwing. `undefined < 1` is `false`, so the check silently passes.

**How to avoid:**
- TypeScript with **no `any`** on the user/state types — `number.kekNumber` then fails to compile.
- A single `canAfford(user, cost)` helper used by both give and casino, unit-tested at the 0-balance boundary.
- Model balance as a non-negative invariant enforced in one mutation function, not at call sites.

**Warning signs:**
Any user balance `< 0` in `db.json`; a balance guard that reads a property off an id; give/casino paths that each re-implement the affordability check.

**Phase to address:** Phase 2 (Core give/revoke/balance loop). This is the Core Value — must have a boundary test.

---

### Pitfall 3: Automating a *user* account violates Telegram ToS — account ban risk

**What goes wrong:**
The MTProto user client drives a real account. Automating user accounts is widely reported to breach Telegram ToS; enforcement includes **permanent** account bans (with no explanation) and blocking re-registration of the phone number. Even low-volume, self-directed automation has triggered bans in documented cases. *(Confidence: LOW — anecdotal, no published deterministic rule.)*

**Why it happens:**
The dual-client design is treated as "just an implementation detail," and a personal account gets wired in because it's the dev's own account that's already in the chat.

**How to avoid:**
- Use a **dedicated, expendable** account for the user client — never a personal/primary account.
- Keep userbot actions minimal and human-paced: only what Bot API genuinely cannot do (casino media `messages.Search`/`SendMedia`). Everything else stays on the Bot API client.
- Respect every flood-wait (Pitfall 4); avoid bursty bulk reads.
- Treat account loss as an expected operational risk: document re-provisioning (new account → new session string → rotate env).

**Warning signs:**
The session belongs to a dev's main account; userbot used for actions the Bot API already supports; bursts of `messages.Search`/history reads.

**Phase to address:** Phase 1 (decision + account provisioning) and the casino phase (keep user-client surface area minimal).

---

### Pitfall 4: FLOOD_WAIT mishandling during casino media search

**What goes wrong:**
Casino paginates chat history/media via `messages.Search` in pages of 100 until exhausted. Hammering this triggers `FLOOD_WAIT_X`. If the code tight-retries instead of waiting the full X seconds, Telegram escalates to longer waits and can lock the account. A swallowed flood error also leaves a player charged 1 kek with no media returned.

**Why it happens:**
GramJS auto-sleeps only when the wait is below `floodSleepThreshold` (~60s by default); longer waits are **thrown** as `FloodWaitError`. Code that doesn't catch the throw either crashes the handler or retries immediately.

**How to avoid:**
- Catch `FloodWaitError`, read `.seconds`, wait the **full** duration, then retry once — never tight-loop.
- Cap/cache the media search: don't re-scan the whole history on every spin; cache the media id list with a TTL so one flood-prone scan serves many casino plays.
- Make casino **atomic with refund**: the 1-kek charge and the media send must both succeed or the kek is refunded (SPEC §8.3 already requires refund-on-error — preserve it).

**Warning signs:**
Casino latency spikes then errors; logs showing repeated `FLOOD_WAIT`; players reporting "lost a kek, got nothing"; full-history rescans per spin.

**Phase to address:** Casino phase (later — deferred per PROJECT.md). Flag for deeper research at that point.

---

### Pitfall 5: Concurrent writes to db.json — lost updates & corruption (SPEC §11.7)

**What goes wrong:**
The original has no concurrency control. Telegram delivers updates concurrently; with async handlers, two messages can each read `db.json`, mutate in memory, and write back — the second write clobbers the first (lost kek). Worse, two overlapping `fs.writeFile`s can interleave and produce a **truncated/corrupt** JSON file that fails to parse on next load, destroying all state.

**Why it happens:**
lowdb-style "read → mutate object → write whole file" is not atomic, and Node's single thread does **not** protect across `await` points: any `await` yields the event loop to another handler mid-transaction. Developers assume single-threaded == safe.

**How to avoid:**
- **Serialize all writes through one async queue/mutex** (e.g. a promise chain or `async-mutex`): every mutation = enqueue(read → mutate → atomic write). PROJECT.md already mandates this.
- **Atomic write pattern:** write to `db.json.tmp` then `fs.rename` (rename is atomic on the same filesystem) so a crash mid-write never corrupts the live file.
- Keep one in-memory source of truth and persist from it, rather than re-reading the file per operation.
- A read-modify-write must be one critical section — do not `await` external I/O (Telegram calls) while "holding" the balance state.

**Warning signs:**
Keks occasionally "don't register" under rapid-fire messages; `db.json` fails `JSON.parse` after a crash/restart; balances that don't sum to the conserved total (give/revoke should conserve total keks).

**Phase to address:** Phase 2 (state layer) — the write queue must exist before any balance mutation is wired up. Add a concurrency stress test.

---

### Pitfall 6: Leaderboard sort comparator returns boolean (SPEC §11.3)

**What goes wrong:**
`collectUserStats` sorted with a comparator returning a boolean (`a > b`) instead of a number. `Array.prototype.sort` requires a number (`<0/0/>0`); a boolean coerces to 0/1, giving an undefined/unstable order. The ranking — the whole point of "who is the funniest" — is wrong.

**Why it happens:**
A natural-language mental model of "is a bigger than b?" maps to `>`, which returns boolean. JS doesn't error.

**How to avoid:**
`(a, b) => b.kekNumber - a.kekNumber` for descending. Unit-test with a known set including ties.

**Warning signs:**
`/stats` order changes between calls with the same data; top scorer not actually highest.

**Phase to address:** Phase 2 (leaderboard, part of core loop).

---

### Pitfall 7: `/reset` maps but never assigns — no-op reset (SPEC §11.4)

**What goes wrong:**
`resetStats` did `users.map(...)` to set everyone to 100 but discarded the returned array, so nothing changed. The admin-only reset silently does nothing.

**Why it happens:**
`map` returns a new array (it's not in-place); the result must be assigned back. Easy to write `users.map(u => ({...u, kekNumber:100}))` and forget the assignment, especially when refactoring from a mutating `forEach`.

**How to avoid:**
Either assign the mapped result back (`state.users = state.users.map(...)`) or mutate in place via `forEach`. Test `/reset` by asserting persisted balances == 100 afterward (and that it routes through the write queue).

**Warning signs:**
`/reset` returns its success message but balances are unchanged on next `/stats`; the reset isn't persisted to disk.

**Phase to address:** Phase 2 (admin commands / core loop).

---

### Pitfall 8: `bot.launch()` never resolves → dual-client startup hangs

**What goes wrong:**
telegraf's `bot.launch()` starts long-polling and returns a promise that **stays pending for the bot's lifetime**. If startup does `await bot.launch()` before `await userClient.connect()`, the GramJS client never starts — the bot half-boots and casino is dead, with no obvious error.

**Why it happens:**
It looks like an ordinary async init call; "await everything" is the default habit. The non-resolving behavior is a well-known telegraf gotcha, not documented at the call site.

**How to avoid:**
Start the GramJS user client first (`await userClient.connect()` / `.start()`), then call `bot.launch()` **without awaiting** it (or launch both and only await the user-client connect). Verify both clients report "connected" in logs before declaring ready.

**Warning signs:**
Startup logs stop after "launching bot"; user-client features (casino) silently never work; no error, just a hung promise.

**Phase to address:** Phase 1 (dual-client bootstrap + lifecycle).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| JSON file instead of a DB | No DB ops, fits a tiny group | Needs hand-rolled write queue + atomic rename; no transactions across fields | Acceptable here (small closed group) — explicitly chosen in PROJECT.md |
| Hardcoded participant identities/admin | Names are part of the joke | Can't reuse for other chats; admin id baked in | Acceptable here (single-chat by design) — but keep secrets/chat-IDs in env, NOT identities |
| Polling (no webhook) | No public HTTP endpoint needed | Double-processing if two instances/overlap; no zero-downtime deploy | Acceptable with a single-instance guarantee; never run 2 replicas |
| `await bot.launch()` | "Feels" correct | Hangs startup (Pitfall 8) | Never |
| Re-reading db.json per operation | Simpler code | Race window + perf; encourages lost updates | Never — use one in-memory source + serialized writes |
| Tight-retry on flood errors | Quick "fix" | Escalates to longer/permanent account locks | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GramJS StringSession | Hardcode string; assume it expires/needs refresh logic | Env-only; treat as full-account secret; rotate by terminating session in app settings |
| GramJS `messages.Search` | Rescan full history every casino spin; ignore FloodWaitError | Cache media-id list w/ TTL; catch `FloodWaitError`, sleep `.seconds`, retry once |
| telegraf updates | Assume handlers run sequentially / single-thread is safe | Serialize state mutations; never hold balance state across an `await` |
| telegraf bot account vs user account | Use Bot API for things only the user client can do, or vice-versa | Bot API for messages/commands; user client ONLY for media search/send (minimize ToS exposure) |
| "Previous message" detection (no reply) | Use Bot API to fetch prior message | Bot API can't read history — must use user-client `GetHistory`, skipping service/bot messages (SPEC §8.1) |
| Detecting the bot's own messages | Compare against wrong id, or trust `from` | Match against `MR_KEK_ID` (5362994462); extract real author from `(<число>)` pattern when sender is the bot |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full media-history scan per casino spin | Latency spikes, flood waits | Cache the media id list with TTL | First time the source chat has thousands of media items |
| `messagesWithKek` never pruned | db.json grows unbounded; slower reads | SPEC §8.1.6 `clearOldMessagesWithKek` (drop >24h) must actually run after each give | Weeks of activity |
| Whole-file rewrite on every mutation | I/O per message | Debounce/queue writes; in-memory truth | Only at unrealistic message rates for this group — low risk here |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| StringSession in source/history | Full user-account takeover | Env-only + rotate leaked key + secret scanning (Pitfall 1) |
| Treating session like a revocable bot token | Underestimating blast radius; no rotation plan | Document that it's a full credential; have a rotation runbook |
| Admin check by hardcoded id only, no validation | If id logic is fuzzed (bot-author extraction), wrong user could gain `/start`/`/reset` | Compare against `LUX` id explicitly; never derive admin from parsed text |
| Logging the session or full message objects | Secret/PII leak in logs | Redact `SESSION_KEY`; don't dump raw update objects at info level |
| Casino relay channel id in source | Minor info leak; coupling | Move `-1001493761518` and chat id to env (SPEC §11.6) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Self-kek allowed | Players farm their own balance | Enforce no-self-kek (SPEC §8.1.3); test it |
| "Previous message" picks a service/bot message | Kek lands on wrong/nobody | Skip service + bot-without-author messages when walking history (SPEC §8.1.1) |
| Casino charges then fails silently | Player loses a kek for nothing | Refund-on-error (SPEC §8.3.5); make charge+send atomic |
| Triple-kek not de-duplicated by giver | One person triple-keks alone | Count distinct `kekedUsers` (no dupes) before triggering the 3-kek event (SPEC §8.1.5) |
| Revoke when receiver at 0 | Negative receiver balance / confusing | Handle the "0 keks — can't take" edge case (SPEC §8.2) |

## "Looks Done But Isn't" Checklist

- [ ] **Give kek:** Often missing the 0-balance guard — verify a 0-balance giver is refused (Pitfall 2) and total keks are conserved across give+revoke.
- [ ] **/reset:** Often a no-op — verify balances actually persist to db.json as 100 (Pitfall 7).
- [ ] **/stats:** Often mis-sorted — verify descending order with ties via a unit test (Pitfall 6).
- [ ] **Concurrency:** Often untested — verify N simultaneous keks all register and db.json never corrupts (Pitfall 5).
- [ ] **Dual-client startup:** Often half-booted — verify BOTH clients log "connected" and casino works, not just commands (Pitfall 8).
- [ ] **Session:** Often still hardcoded somewhere — grep history; verify it loads from env and the old key is rotated (Pitfall 1).
- [ ] **Graceful shutdown:** Verify SIGINT/SIGTERM flush the pending write queue before exit (no lost final write).
- [ ] **db.json persistence:** Verify the file is on a mounted Docker volume, not inside the ephemeral container layer.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Leaked session (Pitfall 1) | HIGH | Terminate session in Telegram → Devices; change account password; regenerate string; rotate `SESSION_KEY`; purge from git history |
| Account banned for automation (Pitfall 3) | HIGH | Provision a new dedicated account; generate new session; reduce user-client activity; accept that the old number may be permanently blocked |
| Corrupt db.json (Pitfall 5) | MEDIUM | Restore from last good backup; the atomic-rename pattern prevents this going forward; consider periodic db.json snapshots |
| Flood-locked account (Pitfall 4) | MEDIUM | Stop all user-client calls; wait out the full FLOOD_WAIT; add caching/backoff before resuming |
| Negative balances shipped (Pitfall 2) | LOW | Clamp/normalize balances in a one-off migration; add the boundary test |
| Double-processed keks (two instances) | LOW | Reconcile via conservation invariant; enforce single-instance deploy |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Session leak / no rotation | Phase 1 (config + bootstrap) | Secret scan passes; session loads from env; old key rotated before deploy |
| 3. User-account ToS ban risk | Phase 1 (provisioning decision) | Dedicated account used; user-client surface documented as minimal |
| 8. `bot.launch()` startup hang | Phase 1 (dual-client lifecycle) | Both clients log connected; casino reachable at boot |
| 2. Negative-balance guard | Phase 2 (core loop) | 0-balance giver refused; keks conserved (test) |
| 5. JSON concurrency / corruption | Phase 2 (state layer) | Concurrent-give stress test passes; atomic rename in place |
| 6. Leaderboard comparator | Phase 2 (leaderboard) | Descending sort test with ties |
| 7. `/reset` no-op | Phase 2 (admin commands) | Post-reset balances persist as 100 |
| 4. FLOOD_WAIT / casino atomicity | Casino phase (deferred) | FloodWaitError caught + waited; refund-on-error; media cache TTL |
| db.json volume persistence | Deploy phase | Survives container restart on mounted volume |
| Graceful shutdown flush | Deploy phase | Pending write completes on SIGTERM |

## Sources

- [GramJS Authentication (sessions)](https://gram.js.org/getting-started/authorization) — StringSession save/reuse (MEDIUM)
- [GramJS StringSession class](https://gram.js.org/beta/classes/sessions.StringSession.html) — credential nature (MEDIUM)
- [Telegram API: Error handling](https://core.telegram.org/api/errors) — FLOOD_WAIT_X semantics (MEDIUM, cross-checked)
- [GramJS FloodWaitError](https://gram.js.org/beta/classes/errors.FloodWaitError.html) — `.seconds`, floodSleepThreshold (MEDIUM)
- [GramJS Handling Errors](https://painor.gitbook.io/gramjs/getting-started/handling-errors) — retry guidance (MEDIUM)
- [Telegram API Terms of Service](https://core.telegram.org/api/terms) — user-account automation terms (LOW)
- [Account banned using automation (case study)](https://www.theiqworkshop.com/2025/10/03/how-my-telegram-account-got-banned-using-n8n-automation-and-what-you-should-know/) — anecdotal ban risk (LOW)
- [telegraf.js docs](https://telegraf.js.org/) — launch + SIGINT/SIGTERM shutdown (MEDIUM)
- SPEC.md §3, §8, §11 — concrete original-code bug list (HIGH, authoritative for this project)
- PROJECT.md — scope, decisions, constraints (HIGH)

---
*Pitfalls research for: dual-client Telegram bot with JSON-file game state*
*Researched: 2026-06-22*
