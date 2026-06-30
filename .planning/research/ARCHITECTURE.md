# Architecture Research

**Domain:** Dual-client Telegram bot (Bot API + MTProto user account) with JSON-file persistence — Node.js + TypeScript
**Researched:** 2026-06-22
**Confidence:** HIGH

## Standard Architecture

The defining decision for this bot is a **hexagonal / ports-and-adapters layout**: pure domain logic in the center, with the two Telegram clients and the JSON store treated as replaceable adapters at the edges. This is not gold-plating — it is the only way to satisfy the SPEC's hard requirements at once:

- Bugs §11.2 / §11.3 / §11.4 (broken balance check, broken sort, broken reset) are all **pure-logic** bugs. They are cheap to prevent and regression-test only if the domain logic does not touch Telegram or the filesystem.
- Bug §11.7 (races on `db.json`) requires a **single chokepoint** for all writes. That chokepoint must own a mutex, which means persistence has to be a distinct layer the domain calls through, not scattered `db.write()` calls inside handlers.
- Error isolation (a user-client failure must not crash the bot) requires the two clients to be **separate, independently-supervised adapters** rather than tangled together.

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      ENTRYPOINT / COMPOSITION ROOT                 │
│   src/main.ts: load config → build store → build clients →         │
│   wire handlers → start both clients → install shutdown hooks      │
└───────────────┬───────────────────────────────────┬───────────────┘
                │                                     │
┌───────────────▼─────────────┐       ┌───────────────▼──────────────┐
│   ADAPTER: Bot API client    │       │  ADAPTER: MTProto user client │
│   (telegraf)                 │       │  (GramJS)                     │
│   - receives commands/msgs   │       │  - messages.Search (media)    │
│   - sends replies            │       │  - GetHistory / participants  │
│   - triggers handlers        │       │  - SendMedia via relay chan   │
└───────────────┬─────────────┘       └───────────────┬──────────────┘
                │  calls (no TG types leak inward)      │ used ONLY by
                ▼                                       ▼ casino service
┌────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                            │
│   Handlers / use-cases: parse trigger → resolve target → call domain │
│   (kek, nekek, casino, /start, /reset, /stats, /help, /keys)         │
│   Maps Telegram update → plain command DTO; maps result → reply text │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ pure calls, plain types only
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                          DOMAIN LAYER (PURE)                         │
│   kek-game: giveKek, revokeKek, tripleKek check, leaderboard sort,   │
│   self-kek guard, balance invariants, reset. NO I/O, NO telegram.    │
│   Operates on a State object passed in, returns new State + events.  │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ load / mutate / persist
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER (Repository)                    │
│   StateStore: getState(), update(mutator) — wraps every             │
│   read-modify-write in an async-mutex runExclusive, then atomic      │
│   write to db.json. SINGLE chokepoint for all state mutation.        │
└───────────────────────────────┬────────────────────────────────────┘
                                 ▼
                          ┌──────────────┐
                          │   db.json    │  (lowdb / atomic file write)
                          └──────────────┘

   ┌──────────────────┐
   │  config + consts  │  env-loaded secrets/IDs + hardcoded participants
   └──────────────────┘  (read at composition root, injected downward)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Composition root** (`main.ts`) | Load config, build store, build both clients, wire handlers, start clients, install shutdown | A single async `bootstrap()` function; dependency injection by constructor args |
| **Config module** | Read & validate env secrets/IDs at boot; expose typed `Config`; hold hardcoded participant table separately | `dotenv` + a validation step that throws on missing `BOT_TOKEN`/`API_ID`/`API_HASH`/`SESSION_KEY`/chat IDs |
| **Bot API adapter** | Receive commands/messages, send replies, register handlers; delete messages | `telegraf` `Bot` instance; thin handler functions that delegate inward |
| **MTProto adapter** | Account-only ops: media search, history reads, participant list, send media via relay | `telegram` (GramJS) `TelegramClient` + `StringSession`; exposes a small typed interface (`searchMedia()`, `getParticipants()`, `sendMediaToRelay()`) |
| **Application / handlers** | Translate a Telegram update into a domain command, call domain, translate result into a reply | Per-trigger functions (`onKek`, `onNekek`, `onCasino`, command handlers) holding no game rules |
| **Domain (`kek-game`)** | All game rules: give/revoke, balance invariants, triple-kek, self-kek guard, leaderboard ordering, reset, init | Pure functions over a `GameState` value object; **no `await`, no I/O, no telegram types** |
| **Persistence (StateStore)** | Single serialized chokepoint for read-modify-write; atomic file writes | Class wrapping lowdb (or `fs` + temp-file rename) with one `async-mutex` Mutex |

## Recommended Project Structure

```
src/
├── main.ts                  # composition root: bootstrap() + shutdown wiring
├── config/
│   ├── env.ts               # load + validate env secrets/IDs (throws if missing)
│   └── participants.ts      # hardcoded participant table + admin (LUX) + MR_KEK_ID
├── domain/
│   ├── state.ts             # GameState, User, MessageWithKek types
│   ├── kek-game.ts          # giveKek, revokeKek, tripleKek, resetStats, initState (PURE)
│   ├── leaderboard.ts       # collectUserStats / correct numeric comparator (PURE)
│   └── triggers.ts          # normalizeText + trigger-word matching (PURE)
├── persistence/
│   └── state-store.ts       # StateStore: getState(), update(mutator) w/ async-mutex
├── telegram/
│   ├── bot-client.ts        # telegraf setup + handler registration
│   ├── user-client.ts       # GramJS client + typed account-op interface
│   └── handlers/
│       ├── kek.ts           # onKek: resolve target → domain.giveKek → reply
│       ├── nekek.ts         # onNekek
│       ├── casino.ts        # onCasino: uses user-client + domain charge/refund
│       └── commands.ts      # /start /reset /stats /help /keys /commands
└── lifecycle/
    └── supervisor.ts        # start both clients w/ error isolation; shutdown handler
test/
├── domain/                  # fast unit tests for all game rules (no mocks needed)
└── ...
```

### Structure Rationale

- **`domain/` has zero imports from `telegram/`, `persistence/`, or `config/env`.** This makes the bug-prone rules (§11.2/3/4) unit-testable with plain objects and no mocks — the single most important testability decision. If a future review ever sees `import { Telegraf }` inside `domain/`, that is a regression.
- **`config/env.ts` vs `config/participants.ts` are deliberately split.** Secrets and chat/channel IDs come from env (fixes §11.1/§11.6); participant identities are hardcoded (a product decision — they're part of the joke). Keeping them in different files makes the "secret vs constant" boundary obvious and prevents accidental hardcoding of a token next to a name.
- **`persistence/state-store.ts` is the only place that writes `db.json`.** Centralizing it is what makes the mutex effective (fixes §11.7). Handlers never touch the file.
- **`telegram/user-client.ts` exposes a narrow typed interface, not the raw GramJS client.** Only the casino service depends on it, so a user-client outage degrades exactly one feature.

## Architectural Patterns

### Pattern 1: Serialized read-modify-write via a single store + async-mutex

**What:** Every balance mutation goes through `StateStore.update(mutator)`, which acquires a process-wide `Mutex` (from `async-mutex`), runs the mutator against the in-memory state, then atomically persists. Telegram updates can arrive concurrently (long polling processes batches, and casino ops `await` network calls mid-flow), so unguarded read-modify-write **will** lose updates.

**When to use:** Any time a handler changes balances or `messagesWithKek`. Read-only paths (`/stats`, `/keys`) can read a snapshot without the lock.

**Trade-offs:** Serializes all writes (fine — a friend-group chat has trivial throughput). Eliminates the §11.7 race class entirely. Must keep mutators synchronous-ish (no long network calls *inside* the critical section) so the lock isn't held during slow GramJS calls — for casino, charge inside the lock, do the media call outside, refund inside the lock on failure.

**Example:**
```typescript
import { Mutex } from 'async-mutex';

class StateStore {
  private mutex = new Mutex();
  constructor(private db: Low<GameState>) {}

  // read-only snapshot (no lock needed; data is replaced atomically on write)
  getState(): GameState { return this.db.data; }

  // the ONLY mutation path — fixes §11.7
  update<T>(mutator: (s: GameState) => T): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const result = mutator(this.db.data); // pure domain fn mutates draft
      await this.db.write();                // atomic temp-file + rename
      return result;
    });
  }
}
```

### Pattern 2: Pure domain functions that take and return state

**What:** Game rules are pure functions: `giveKek(state, giverId, targetUserId, messageId)` validates (self-kek guard, balance >= 1) and mutates the passed state, returning an outcome (`{ ok: true, tripleKek: boolean }` or a typed error). They never import telegraf, GramJS, or the store.

**When to use:** All of kek/nekek/triple-kek/reset/init/leaderboard.

**Trade-offs:** Requires the handler to do the Telegram-specific work (resolving the reply target, extracting author id from bot-message text). That separation is exactly what makes §11.2/3/4 testable. Tiny boilerplate cost; large correctness payoff.

**Example:**
```typescript
// domain/kek-game.ts — pure, no I/O
export function giveKek(s: GameState, giverId: number, targetUserId: number, messageId: number): KekResult {
  if (giverId === targetUserId) return { ok: false, reason: 'self-kek' };
  const giver = s.users.find(u => u.id === giverId);          // §11.2: use giver, not a stray var
  if (!giver || giver.kekNumber < 1) return { ok: false, reason: 'no-funds' };
  const target = s.users.find(u => u.id === targetUserId);
  if (!target) return { ok: false, reason: 'unknown-target' };
  giver.kekNumber -= 1; target.kekNumber += 1;
  giver.lastKekGivenTo = { userId: targetUserId, messageId };
  // ...register in messagesWithKek without dup, detect triple-kek...
  return { ok: true, tripleKek: /* count === 3 */ false };
}
```

### Pattern 3: Independent client supervision with error isolation

**What:** The two clients are started independently and supervised separately. A crash/disconnect in the GramJS user client is caught and logged (and disables casino) without taking down the telegraf bot. **Key fact (verified):** in modern telegraf v4 (>4.10), `await bot.launch()` does **not** resolve while long polling runs — it stays pending until `bot.stop()`. So do **not** sequentially `await bot.launch()` before starting the user client (the SPEC §10 "parallel start" must be implemented as genuinely parallel/non-blocking, not a sequential await chain).

**When to use:** Bootstrap and shutdown.

**Trade-offs:** Slightly more wiring than a naive `await a; await b`. Prevents the whole-process crash on a user-session failure and avoids the classic "code hangs after `await bot.launch()`" footgun.

**Example:**
```typescript
async function bootstrap() {
  const config = loadConfig();                 // throws if any secret missing
  const store = await StateStore.open(config); // load db.json or init

  const bot = buildBotClient(config, store);   // telegraf
  const user = buildUserClient(config);        // GramJS

  // start user client and isolate its failures (casino degrades, bot survives)
  user.start().catch(err => log.error('user-client failed; casino disabled', err));

  // do NOT await this — v4 launch stays pending during long polling
  bot.launch(() => log.info('Bot started'));

  installShutdown(bot, user);
}

function installShutdown(bot: Bot, user: UserClient) {
  const stop = (sig: string) => {
    bot.stop(sig);
    user.disconnect().catch(() => {});
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}
```

## Data Flow

### Request Flow — "a message becomes a balance change"

```
Telegram update (text "кек" as a reply)
    ↓
telegraf Bot API adapter  (telegram/bot-client.ts)
    ↓  normalizeText + trigger match (domain/triggers.ts, pure)
onKek handler  (telegram/handlers/kek.ts)
    ↓  resolve target message + author id (telegram-specific glue)
    ↓     - if reply → replied message; else → previous meaningful message (GetHistory via user client OR telegraf)
    ↓     - if author is the bot → extract real id from "(<число>)" in text
store.update( s => giveKek(s, giverId, targetId, msgId) )   ← mutex + atomic write
    ↓  domain validates self-kek / funds, mutates balances, flags triple-kek
result returned out of the critical section
    ↓
handler maps result → reply text (public confirmation, or refusal joke, or triple-kek congrats)
    ↓
Bot API adapter sends reply / deletes message
```

Casino adds one branch: handler charges 1 kek **inside** a `store.update`, calls the **user client** (`searchMedia` → pick random → `sendMediaToRelay` → copy to chat) **outside** the lock, and on failure does a second `store.update` to refund — never holding the mutex across the network call.

### State Management

```
db.json  ──load──▶  in-memory GameState (owned by StateStore)
                         ▲                         │
                         │ atomic write            │ getState() snapshot (read-only paths)
                         │ (under mutex)           ▼
            store.update(mutator) ◀── handlers (all mutating paths)
                         │
                         ▼ mutator is a PURE domain fn (giveKek/revokeKek/reset…)
```

### Key Data Flows

1. **Give/revoke kek:** trigger match → target resolution (TG glue) → `store.update(domain fn)` → reply. The only place balances change.
2. **Leaderboard (`/stats`):** `store.getState()` snapshot → `collectUserStats` (pure, **correct numeric comparator** — fixes §11.3) → formatted HTML reply. No write, no lock.
3. **Init / reset (`/start`, `/reset`, LUX only):** admin check (from `config/participants`) → `store.update(initState | resetStats)`. `resetStats` must **assign** the rebuilt users back into state (fixes §11.4 — the original mapped but discarded the result). `/start` must guard against uninitialized state (fixes §11.8).
4. **Casino:** charge (locked) → user-client media pipeline (unlocked) → success or refund (locked).

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| This bot (one closed chat, ~4 users) | Single process, JSON file + mutex is ideal; no changes needed |
| Hypothetical 10s of chats | Per-chat state keys in the JSON, or switch StateStore impl to SQLite — domain layer unchanged because it's decoupled |
| 100k+ | Out of scope by explicit project decision; would require a real DB — but only the persistence adapter changes |

### Scaling Priorities

1. **First bottleneck:** none realistic at this scale. The mutex serializes writes, but write volume is human-typing-speed.
2. **If it ever grew:** the StateStore is the single swap point — replace lowdb+mutex with SQLite (which gives transactions for free). Because the domain layer takes/returns plain state, nothing else changes.

## Anti-Patterns

### Anti-Pattern 1: Game logic inside telegraf/GramJS handlers

**What people do:** Compute balance changes, sorting, and validation directly inside `bot.on('text', ctx => ...)`, reading and writing `db.json` in place.
**Why it's wrong:** This is exactly how the original produced §11.2/3/4 — the bugs are invisible because there's no way to test them without a live Telegram connection, and it scatters `db.write()` so no mutex can protect them (§11.7).
**Do this instead:** Handlers do TG-specific glue only; all rules live in pure `domain/` functions invoked through `store.update`.

### Anti-Pattern 2: Scattered `db.write()` / no single mutation chokepoint

**What people do:** Call `db.write()` (or `fs.writeFile`) from many handlers, assuming Node's single thread makes it safe.
**Why it's wrong:** Single-threaded ≠ race-free. Any handler that `await`s mid-operation (casino media calls, history reads) yields the event loop; a second update interleaves and one update's balance change is lost (§11.7). lowdb's "atomic write" prevents a corrupt file but **not** lost updates.
**Do this instead:** Route every mutation through `StateStore.update`, guarded by one `async-mutex` Mutex; never hold the lock across a network call.

### Anti-Pattern 3: Sequentially `await bot.launch()` then starting the user client

**What people do:** `await bot.launch(); await userClient.start();`
**Why it's wrong:** In telegraf v4 (>4.10) `bot.launch()` does not resolve while long polling runs, so the user client never starts — the process appears to hang at boot.
**Do this instead:** Start the user client (await its `start()` if you want connection confirmation), then call `bot.launch(callback)` without awaiting; supervise each independently.

### Anti-Pattern 4: One try/catch swallowing both clients

**What people do:** Wrap both clients in a single supervisor that exits the process on any error.
**Why it's wrong:** A transient GramJS session/network error then kills the core give/revoke loop, which is the product's whole value.
**Do this instead:** Isolate the user client — catch its failures, log, disable casino, keep the bot running.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Telegram Bot API | telegraf `Bot`, long polling; `BOT_TOKEN` from env | `await bot.launch()` blocks in v4 — don't await; install SIGINT/SIGTERM → `bot.stop()` |
| Telegram MTProto (user account) | GramJS `TelegramClient` + `StringSession` from `SESSION_KEY` env | Full account access — secret must be env-only and the leaked key rotated (§11.1). Used only by casino; wrap raw API in a narrow typed interface |
| Relay channel | hardcoded ID today → move to env (§11.6) | Used to launder media for casino send-then-copy |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| handlers ↔ domain | direct pure function calls via `store.update` | No Telegram types cross into domain |
| domain ↔ persistence | domain mutates the state object the store passes in | Domain never imports the store; store invokes domain mutators |
| casino handler ↔ user client | narrow typed interface (`searchMedia`, `sendMediaToRelay`) | Only dependency on GramJS; isolates user-client failures |
| config ↔ everything | injected from composition root | Secrets from env; participants hardcoded; never read env deep in the tree |

## Suggested Build Order (for the roadmap)

Dependencies flow inside-out, which is also lowest-risk-first and lets the bug-prone logic be tested before any Telegram wiring exists:

1. **Domain core (pure) + tests** — `state.ts`, `kek-game.ts` (give/revoke/self-kek/funds), `leaderboard.ts` (correct comparator), `triggers.ts`. Directly kills bugs §11.2/3/4 with unit tests, zero Telegram needed. *Depends on: nothing.*
2. **Config layer** — env load/validate (`BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, chat id, relay id) + hardcoded participants/admin. Kills §11.1/§11.5/§11.6. *Depends on: nothing.*
3. **Persistence (StateStore) + tests** — lowdb/atomic file + `async-mutex` chokepoint; init/load. Kills §11.7; concurrency test proves no lost updates. *Depends on: domain types.*
4. **Bot API adapter + core handlers** — telegraf wiring, kek/nekek, `/stats`, `/help`, `/keys`, `/start`/`/reset` (admin guard, guard uninitialized state — §11.8). This is the **MVP / core value** (give-revoke-balance loop). *Depends on: 1, 2, 3.*
5. **Lifecycle / supervisor** — parallel non-blocking startup, SIGINT/SIGTERM shutdown, user-client error isolation. *Depends on: 4 (and 6 for the user client handle).*
6. **MTProto user client adapter + casino** — GramJS client, narrow account interface, casino handler with charge-outside-network-inside-lock refund pattern. Deferred per project decision. *Depends on: 2, 3, 4.*

Phases 1–3 are independent of Telegram and should be flagged as **standard patterns, low research risk**. Phase 6 (GramJS MTProto media search + relay-channel send) is the **highest research-risk** phase — raw MTProto API shapes (`messages.Search`, pagination, `SendMedia`) and session handling are the least standardized part and most likely to need phase-specific research.

## Sources

- async-mutex (DirtyHairy/async-mutex) — `runExclusive` serialized read-modify-write [HIGH]
- lowdb (typicode/lowdb) — `db.update`/`db.write`, safe atomic writes, no internal locking, single-process [HIGH]
- telegraf.js docs + telegraf GitHub issues #1989/#1749/#1867 — `bot.launch()` non-resolving under long polling in v4; SIGINT/SIGTERM `bot.stop()` shutdown [MEDIUM–HIGH]
- SPEC.md §3 (dual-client), §5 (data model), §10 (lifecycle), §11 (known bugs); PROJECT.md (constraints & decisions) [HIGH — authoritative project reference]

---
*Architecture research for: dual-client Telegram bot with JSON persistence*
*Researched: 2026-06-22*
