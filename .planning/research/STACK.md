# Stack Research

**Domain:** TypeScript Telegram group-chat game bot with dual-client architecture (Bot API + MTProto user account)
**Researched:** 2026-06-22
**Confidence:** HIGH (core framework choices verified against official docs/maintainer statements + live npm registry; MEDIUM on MTProto library tradeoff — see notes)

## Executive Recommendation (read first)

1. **Bot API framework: switch from telegraf to grammY.** Telegraf's own maintainer has publicly declared the project needs a new maintainer and that v4 "no longer has a future"; grammY is written by the original telegraf author as its successor, has first-class TypeScript types, an actively maintained ecosystem, and the best docs in the space. For a *new* TS project in 2026 there is no good reason to start on telegraf. **HIGH confidence.**
2. **MTProto user client: keep GramJS (`telegram`) for the rewrite, but know mtcute is the modern alternative.** GramJS is what the original used, has all four raw calls the casino needs working today, and is a near-1:1 port path. Its release cadence has slowed (last publish Feb 2025), so if you value active maintenance and native TS more than a low-risk port, **mtcute** is the better long-term choice. Recommendation: **GramJS for the initial rewrite (lowest porting risk), with mtcute as the documented migration target.** MEDIUM confidence on the tiebreak (both are valid).
3. **Storage: lowdb v7 (ESM, native TS types) + a single `async-mutex` Mutex** wrapping every read-modify-write of the balance state. This directly fixes SPEC §11.7 (no concurrency control) without adopting a real DB.
4. **Tooling: `tsx` for dev/run, `tsc` for type-check + build, `vitest` for tests, ESLint 9 flat config + `typescript-eslint`, `node:22-bookworm-slim` Docker base** (multi-stage). Avoid Alpine because GramJS pulls native crypto and Alpine's musl libc causes subtle failures.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22.x (active LTS) | Runtime | Original ran on nodejs14 (EOL). Node 22 is active LTS through 2027, has stable global `fetch`, native `--test` and best perf; moving off maintenance LTS (20) to active LTS (22) removes a class of Node CVEs. |
| TypeScript | 5.9.x (pin; not 6.0) | Language / type safety | **Pin to 5.9**, not the just-released 6.0 — type-checking the balance/state logic is the whole reason for the rewrite, and 6.0 is too new for the bot ecosystem's published types. Move to 6.x only after the ecosystem catches up. |
| grammY | ^1.44 | Bot API client (`BOT_TOKEN`) | Successor to telegraf by the same author; excellent first-class TS types, composable middleware, built-in session plugin, lightweight. The modern default for new TS bots. |
| GramJS (`telegram`) | ^2.26 | MTProto user-account client (`API_ID`/`API_HASH`/`StringSession`) | Same library the original used (`^2.7` → current `2.26`); the casino's raw calls (`messages.Search`, `messages.GetHistory`, `channels.GetParticipants`, `messages.SendMedia`) work today. Lowest porting risk. Uses `StringSession` loaded from `SESSION_KEY` env (fixes SPEC §3 hardcoded-session bug). |
| lowdb | ^7.0 | JSON-file state store (`db.json`) | Native ESM + bundled TS types, tiny, idiomatic for a small single-process bot. Matches the SPEC constraint to keep JSON storage. |
| async-mutex | ^0.5 | Serialize writes to `db.json` | A single `Mutex` (or `withTimeout`) around each read-modify-write makes balance ops atomic within the process — directly fixes the SPEC §11.7 race condition. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | ^17 | Load `.env` in dev | Local dev only; in Docker/VPS pass real env vars. Original already used it. |
| zod | ^4 | Validate env vars + parse the loaded `db.json` shape | Fail fast at boot if `BOT_TOKEN`/`API_ID`/`API_HASH`/`SESSION_KEY`/chat IDs are missing or malformed; gives the `db.json` model real runtime guarantees. Optional but recommended. |
| pino | ^10 | Structured logging | Replaces ad-hoc `console.log("Bot started")`; useful on a long-running VPS process. `pino-pretty` in dev only. |
| @grammyjs/runner | ^2 | Concurrent/long-polling update runner for grammY | Optional. Use only if you need concurrent update handling; for one small chat the default `bot.start()` long-polling is fine. |

> **Session-string generation note (GramJS):** generating the `StringSession` once (interactive login) typically uses the `input` package for prompts. Keep that as a one-off **script/devDependency**, not a runtime dependency — the running bot only ever reads the pre-generated `SESSION_KEY`.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsx | Run TS directly in dev + watch mode | `tsx watch src/index.ts`. Fast esbuild-based, zero config, the current idiomatic choice. **Use instead of ts-node.** |
| tsc | Type-check (`--noEmit`) in CI + emit JS for the prod image | Keep `tsc` as the source of truth for type errors even though tsx runs without type-checking. |
| vitest | Test runner | ^4. ESM- and TS-native out of the box, Jest-compatible API, far less config than Jest for an ESM/TS project. Use for the SPEC §12 test coverage (kek/некек/triple-kek/casino/edge cases). |
| ESLint 9 + typescript-eslint | Linting | Flat config (`eslint.config.js`). ESLint 9/10 dropped legacy `.eslintrc`. |
| Prettier | Formatting | Optional; pair with `eslint-config-prettier` to avoid rule conflicts. |
| Docker (multi-stage) | Deployment to VPS | Build stage on `node:22-bookworm` (full, for any native compile), runtime on `node:22-bookworm-slim`, run as non-root, `NODE_ENV=production`. |

## Installation

```bash
# Core
npm install grammy telegram lowdb async-mutex dotenv

# Supporting
npm install zod pino
npm install pino-pretty --save-dev   # dev logging only

# Dev / tooling
npm install -D typescript@5.9 tsx vitest eslint typescript-eslint prettier eslint-config-prettier
npm install -D input                 # only for the one-off session-string generator script
```

`package.json` should set `"type": "module"` (lowdb v7 and tsx are ESM-first).

Suggested scripts:

```jsonc
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint ."
  }
}
```

## telegraf vs grammY — concrete comparison (the headline decision)

| Criterion | telegraf 4.16.3 | **grammY 1.44 (recommended)** | node-telegram-bot-api 1.1.0 |
|-----------|-----------------|-------------------------------|------------------------------|
| TypeScript support | TS port of a JS lib; types are notoriously complex/leaky, ctx typing is awkward | **Written in TS from the ground up; clean, accurate, ergonomic types** | Minimal; types via `@types/...`, weakest of the three |
| Maintenance/activity | **Maintainer publicly seeking a successor; "no future" per the author**; last publish Mar 2026 but in maintenance-only mode | **Active**, by the original telegraf author; last publish Jun 2026 | Long stagnation, only just reached 1.0/1.1 in Jun 2026 |
| Middleware/session model | Composer/middleware + session middleware (external stores) | **Composer middleware + official `session` plugin + storage adapters (incl. file storage)** | Event-emitter style; no real middleware/session abstraction |
| Ergonomics / docs | Decent but dated docs; complex generics surface in user code | **Best docs in the space; filter queries (`bot.on("message:text")`), typed context flavors** | Bare-bones, callback/event oriented |
| Verdict for a new TS project (2026) | Do not start here | **Start here** | Avoid for new TS work |

**Definitive recommendation: switch off telegraf to grammY.** The original `telegraf ^4.8` works, but starting a *fresh* 2026 TS rewrite on a framework whose maintainer has declared it has no future, when the same author's actively-maintained successor with better types exists, would be a mistake. The migration cost is low because the rewrite is from-scratch anyway. grammY's `session` plugin + a file-storage adapter is also a natural fit, though we deliberately keep our own `db.json` + mutex for the game state (see Storage).

## GramJS vs mtcute — the MTProto user-client decision

| Criterion | **GramJS (`telegram`) — recommended for the rewrite** | mtcute (`@mtcute/node`) — the modern alternative |
|-----------|-------------------------------------------------------|---------------------------------------------------|
| Origin | Port of Python's Telethon | Purpose-built modern TS library |
| TypeScript | Has types, but JS-first design shows | **Native TS, fully typed `.call()` raw API, near-complete typed docs** |
| Maintenance (npm) | Patch releases slowed; **last publish Feb 2025** (~16 mo stale at time of research), repo still has recent issue activity | **Actively maintained** (last publish Jun 2026, 0.30.x), tracks latest TL schema |
| Raw calls the casino needs | `messages.Search`, `messages.GetHistory`, `channels.GetParticipants`, `messages.SendMedia` — **all available and proven in the original code** | All available via typed `tg.call({ _: "messages.search", ... })`; also `customMethod` for undocumented calls |
| Runtime support | Node + browser | Node, Bun, Deno, browser |
| Porting risk for this project | **Lowest** — the original used GramJS; raw-call shapes carry over | Higher — every raw call must be rewritten in mtcute's API |

**Recommendation:** Use **GramJS for the initial rewrite** to minimize risk on the casino feature (the four raw calls already exist in the original implementation and only need re-typing). Treat **mtcute as the documented migration target** if GramJS's slowing release cadence becomes a problem (e.g. a future TL-layer break). Both are valid; this is a port-risk-vs-freshness tradeoff, not a correctness one. The casino is explicitly a *future* feature in the roadmap, so the user-client choice can be revisited at that phase without blocking the core kek loop.

> If you would rather not carry a stale dependency at all and are willing to write the raw calls fresh, **mtcute is the defensible 2026 default** — it is the only actively maintained, native-TS MTProto client. Flag this as a phase-level decision when the casino phase is planned.

## Storage & write-safety

- **lowdb v7** is current (published Mar 2025), pure ESM, ships its own TS types, `engines: node >=18`. Use `JSONFilePreset` / `JSONFile` adapter with a typed schema interface matching SPEC §5 (`users[]`, `messagesWithKek[]`).
- **Serialize all writes with `async-mutex`.** Wrap every read-modify-write (`giveKek`, `revertKek`, casino debit/refund, `/start`, `/reset`) in `mutex.runExclusive(async () => { await db.read(); /* mutate */ await db.write(); })`. Since the bot is a single long-running process, an in-process `Mutex` is sufficient and simpler than file locks. This is the fix for SPEC §11.7.
- **Only if you ever run multiple processes** would you need cross-process file locking (`proper-lockfile`). For this single-process bot, do **not** add it — it's unnecessary complexity.
- `async-lock` is an equivalent alternative to `async-mutex`; `async-mutex` is preferred for its tighter TS types and `withTimeout` helper.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| grammY | telegraf | Only if porting a large existing telegraf codebase you can't afford to rewrite — not the case here (from-scratch rewrite). |
| grammY | node-telegram-bot-api | Never for a new TS project; only a tiny callback-style script with no middleware/session needs. |
| GramJS | mtcute | If you want active maintenance + native TS and are willing to rewrite the raw calls; strong choice for the casino phase. |
| lowdb + mutex | better-sqlite3 / SQLite | If the data model grows beyond a handful of users or needs real queries/transactions. Out of scope per PROJECT.md (no relational DB). |
| async-mutex | proper-lockfile | Only if the bot runs as multiple processes/replicas (cross-process locking). |
| tsx | ts-node | Legacy; slower, more config. No reason to choose for a new project. |
| vitest | jest | Only if a team already standardizes on Jest; needs more ESM/TS config. |
| node:22-slim (Debian) | node:22-alpine | Pure-JS images only. **Avoid Alpine here** — GramJS uses native crypto and musl libc can cause subtle runtime failures. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| telegraf (as the starting framework) | Maintainer declared it has no future / needs a new maintainer; complex leaky TS types | grammY |
| node-telegram-bot-api | Weak types, event-emitter style, only just reached 1.0 after years stagnant | grammY |
| ts-node | Slower, heavier config than the modern alternative | tsx |
| Alpine base image | musl libc + GramJS native crypto = subtle failures | node:22-bookworm-slim |
| Hardcoding the MTProto session string | Full account compromise (SPEC §3 / §11.1) | `SESSION_KEY` env var via `StringSession`, key rotated before deploy |
| TypeScript 6.0 (bleeding edge) | Just released; bot ecosystem types not yet validated against it | Pin TypeScript 5.9 |
| A hosted/relational DB | Overkill for a 4-person closed chat; explicitly out of scope | lowdb + async-mutex |

## Stack Patterns by Variant

**If you stay single-process (recommended for this bot):**
- Use lowdb + a single in-process `async-mutex` Mutex.
- Default grammY long-polling (`bot.start()`); no `@grammyjs/runner` needed.

**If the casino feature is prioritized and GramJS feels stale at that point:**
- Migrate the user-client to mtcute (`@mtcute/node`), rewriting the four raw calls with typed `.call()`.
- This is a contained, phase-scoped change since the casino is the only user-client consumer.

**If you ever scale to multiple replicas (not planned):**
- Replace the in-process mutex with `proper-lockfile` (or move state to SQLite/Postgres) — but this contradicts PROJECT.md scope.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| lowdb@7 | Node >=18, `"type":"module"` | Pure ESM — project must be ESM. Pairs cleanly with tsx/vitest (ESM-native). |
| grammy@1.44 | Node ^12.20 \|\| >=14.13 | Works on Node 22; no issues with ESM. |
| telegram (GramJS)@2.26 | Node 18/20/22 | Pulls native crypto deps → use Debian slim, not Alpine, in Docker. |
| typescript@5.9 | tsx@4, vitest@4, typescript-eslint | Do not jump to TS 6.0 yet. |
| tsx@4 / vitest@4 | ESM + TS | Both run TS ESM directly; align `tsconfig` `module`/`moduleResolution` to `NodeNext`. |

## Sources

- npm registry (live `npm view`, 2026-06-22) — current versions & last-modified dates: grammy 1.44.0 (Jun 2026), telegraf 4.16.3 (Mar 2026), telegram/GramJS 2.26.22 (last publish Feb 2025), @mtcute/node 0.30.1 (Jun 2026), node-telegram-bot-api 1.1.0 (Jun 2026), lowdb 7.0.1 (ESM, Mar 2025), async-mutex 0.5.0, tsx 4.22.4, vitest 4.1.9, typescript 6.0.3 (latest) — **HIGH confidence**.
- [grammY — How grammY Compares to Other Bot Frameworks](https://grammy.dev/resources/comparison) — type-safety/middleware/maintenance comparison — HIGH.
- [telegraf Discussion #1526 — "NEW MAINTAINER NEEDED"](https://github.com/telegraf/telegraf/discussions/1526) — telegraf's "no future" status, from the project itself — HIGH.
- [grammY GitHub](https://github.com/grammyjs/grammy) and [grammy.dev](https://grammy.dev/) — feature set, session plugin — HIGH.
- [mtcute docs — Raw API](https://mtcute.dev/guide/topics/raw-api), [MTProto vs Bot API](https://mtcute.dev/guide/intro/mtproto-vs-bot-api), [FAQ](https://mtcute.dev/guide/intro/faq) — typed raw calls, schema freshness, runtime support — HIGH.
- [GramJS GitHub](https://github.com/gram-js/gramjs) + [npm telegram](https://www.npmjs.com/package/telegram) — raw `invoke`/API method support, release cadence — MEDIUM (maintenance pace inferred from release dates).
- [Snyk — Choosing the best Node.js Docker image](https://snyk.io/blog/choosing-the-best-node-js-docker-image/) and [Dockerizing Node.js for Production: 2026 Guide](https://dev.to/axiom_agent/dockerizing-nodejs-for-production-the-complete-2026-guide-7n3) — slim vs alpine, multi-stage, Node 22 LTS — HIGH for slim-over-alpine guidance with native modules.

---
*Stack research for: TypeScript Telegram dual-client game bot*
*Researched: 2026-06-22*
