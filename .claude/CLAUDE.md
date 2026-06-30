<!-- GSD:project-start source:PROJECT.md -->

## Project

**Mr. Kek (Мистер Кек)**

A Telegram group-chat bot for a closed friend group that implements a virtual "kek"
currency game: members award each other "keks" for funny messages, and the bot tracks
every member's balance and a shared leaderboard ("Кеказна") ranking who is the funniest.
This is a from-scratch TypeScript rewrite of an existing Node.js bot, reusing its
reverse-engineered behavior (see `SPEC.md`) while fixing known bugs, removing hardcoded
secrets, and making balance operations safe from races.

**Core Value:** Members can reliably give and revoke "keks" on each other's messages and see an accurate
leaderboard — the give/revoke/balance loop must always be correct. Everything else is
flavor on top of that.

### Constraints

- **Tech stack**: Node.js 22 + TypeScript 5.9 — grammY for the Bot API client (telegraf is maintainer-declared dead), GramJS for the MTProto user client, lowdb v7 + async-mutex for state, tsx + vitest for tooling
- **Storage**: JSON file (lowdb-style) with a serialized write queue / locking — fix races without DB ops overhead
- **Architecture**: Dual-client (telegraf Bot API + GramJS MTProto user client) — required for casino/media features
- **Deployment**: Docker / VPS, long-running process, env-based config — replaces the old App Engine / Heroku setup
- **Secrets**: All credentials and the session string in env vars only; rotate the leaked key

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Executive Recommendation (read first)

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

# Core

# Supporting

# Dev / tooling

## telegraf vs grammY — concrete comparison (the headline decision)

| Criterion | telegraf 4.16.3 | **grammY 1.44 (recommended)** | node-telegram-bot-api 1.1.0 |
|-----------|-----------------|-------------------------------|------------------------------|
| TypeScript support | TS port of a JS lib; types are notoriously complex/leaky, ctx typing is awkward | **Written in TS from the ground up; clean, accurate, ergonomic types** | Minimal; types via `@types/...`, weakest of the three |
| Maintenance/activity | **Maintainer publicly seeking a successor; "no future" per the author**; last publish Mar 2026 but in maintenance-only mode | **Active**, by the original telegraf author; last publish Jun 2026 | Long stagnation, only just reached 1.0/1.1 in Jun 2026 |
| Middleware/session model | Composer/middleware + session middleware (external stores) | **Composer middleware + official `session` plugin + storage adapters (incl. file storage)** | Event-emitter style; no real middleware/session abstraction |
| Ergonomics / docs | Decent but dated docs; complex generics surface in user code | **Best docs in the space; filter queries (`bot.on("message:text")`), typed context flavors** | Bare-bones, callback/event oriented |
| Verdict for a new TS project (2026) | Do not start here | **Start here** | Avoid for new TS work |

## GramJS vs mtcute — the MTProto user-client decision

| Criterion | **GramJS (`telegram`) — recommended for the rewrite** | mtcute (`@mtcute/node`) — the modern alternative |
|-----------|-------------------------------------------------------|---------------------------------------------------|
| Origin | Port of Python's Telethon | Purpose-built modern TS library |
| TypeScript | Has types, but JS-first design shows | **Native TS, fully typed `.call()` raw API, near-complete typed docs** |
| Maintenance (npm) | Patch releases slowed; **last publish Feb 2025** (~16 mo stale at time of research), repo still has recent issue activity | **Actively maintained** (last publish Jun 2026, 0.30.x), tracks latest TL schema |
| Raw calls the casino needs | `messages.Search`, `messages.GetHistory`, `channels.GetParticipants`, `messages.SendMedia` — **all available and proven in the original code** | All available via typed `tg.call({ _: "messages.search", ... })`; also `customMethod` for undocumented calls |
| Runtime support | Node + browser | Node, Bun, Deno, browser |
| Porting risk for this project | **Lowest** — the original used GramJS; raw-call shapes carry over | Higher — every raw call must be rewritten in mtcute's API |

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

- Use lowdb + a single in-process `async-mutex` Mutex.
- Default grammY long-polling (`bot.start()`); no `@grammyjs/runner` needed.
- Migrate the user-client to mtcute (`@mtcute/node`), rewriting the four raw calls with typed `.call()`.
- This is a contained, phase-scoped change since the casino is the only user-client consumer.
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

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
