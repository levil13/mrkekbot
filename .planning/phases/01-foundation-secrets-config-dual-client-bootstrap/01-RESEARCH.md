# Phase 1: Foundation — Secrets, Config & Dual-Client Bootstrap - Research

**Researched:** 2026-06-22
**Domain:** Node.js 22 / TypeScript ESM composition root for a dual Telegram-client long-running process (grammY Bot API + GramJS MTProto user client), env-based config with fail-fast validation, secret rotation, graceful shutdown.
**Confidence:** HIGH (core startup/shutdown idioms verified against grammY API reference + GramJS docs + Zod 4 docs + Doppler docs this session; LOW items isolated in the Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Fail-fast on either client.** If the grammY Bot API client OR the GramJS user client cannot connect at boot, the process refuses to start and logs which client failed and why. No degraded / Bot-API-only mode and no background-retry state in v1. The user client is required to be up because v1 target resolution (KEK-02/KEK-03) depends on it later.
- **D-02: Aggregate-all validation.** zod validates the full env surface and reports **every** missing/invalid variable at once, then exits non-zero. Do not fail on the first missing var. The error output must name what is missing.
- **D-03: Secrets vs constants split is locked** — `BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, the main chat id, and the casino relay channel id come from env (CFG-01/CFG-02); participant identities + admin (LUX) + bot account id are hardcoded constants (CFG-04). No secret may appear in source.
- **D-04: Executable login helper + runbook.** Ship a runnable tsx helper (e.g. `npm run login`) that prompts for phone/code and prints a fresh `StringSession`, plus a short markdown runbook documenting the rotation. The compromised session must be rotated before any deploy.
- **D-05: Graceful shutdown with a force-exit timeout.** On SIGINT/SIGTERM, stop both clients cleanly; if either hangs past a bounded timeout (~5–10s, planner's call), force `process.exit` so the process can never hang.
- **D-08: Doppler is the secrets/env provider.** Secrets injected as real env vars at runtime via `doppler run -- <cmd>` (dev) and the equivalent on the VPS. **App code unchanged** — the zod loader still reads `process.env`; Doppler is transparent. npm scripts wrap run/login with `doppler run --`; keep an unwrapped variant / documented override so the app can boot from a plain `.env` if Doppler is unavailable. dotenv = optional local fallback. `.env.example` is the authoritative list of required keys (doubles as Doppler config schema). README documents Doppler path + plain-`.env` fallback.

### Claude's Discretion
- Module/file layout (config module, constants module, composition root, logging setup).
- Logging: pino is the locked choice (CLAUDE.md); level/format/what-to-log at boot is the planner's call. `pino-pretty` for dev only.
- Exact non-blocking startup mechanics — note the known grammY footgun: `bot.start()` does not resolve until the bot stops, so it must **not** be awaited as part of the boot sequence; confirm "both connected" via the appropriate readiness signals rather than awaiting the long-poll loop.
- Force-exit timeout duration and precise shutdown ordering.

### Deferred Ideas (OUT OF SCOPE)
- **Docker/VPS deployment artifacts** (multi-stage Dockerfile, .dockerignore, non-root runtime) — separate deployment pass (D-06).
- **Casino + all other MTProto raw calls** (`messages.Search`/`GetHistory`, `channels.GetParticipants`, `messages.SendMedia`) — v2. The user client is **booted and verified-connected only** in this phase; not wired to any feature.
- **Background-retry / degraded-mode resilience** for the user client — considered and rejected for v1 (fail-fast chosen).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-01 | All secrets (BOT_TOKEN, API_ID, API_HASH, MTProto session string) load from env — never hardcoded | Zod env loader reading `process.env` (§Code Examples: env loader); Doppler/dotenv both populate `process.env` so source stays clean (D-08). `.env.example` ships placeholders only. |
| CFG-02 | Main chat ID and casino relay channel ID load from env | Same env loader; `z.coerce.number()` for the negative chat ids (e.g. `-1001685837062`). Names at planner discretion (`MAIN_CHAT_ID` / `RELAY_CHANNEL_ID`). |
| CFG-03 | Compromised MTProto session rotated + runbook to generate a fresh StringSession | GramJS `client.start({...})` interactive login + `client.session.save()` helper (§Code Examples: login helper); runbook steps in §Common Pitfalls / §Session Rotation Runbook. |
| CFG-04 | Participant identities, admin (LUX), bot account id as hardcoded constants | Pure TS constants module; exact ids preserved (§Standard Stack / §Architecture). No I/O, no env. |
| CFG-05 | grammY Bot API + GramJS user client start in one process with correct non-blocking startup, graceful SIGINT/SIGTERM shutdown | grammY `bot.init()`+`getMe()` readiness then unawaited `bot.start()`; GramJS `connect()`+`getMe()` verify; `process.once` signal handlers + `setTimeout(...).unref()` force-exit (§Architecture Patterns, §Code Examples). |
</phase_requirements>

## Summary

This phase is a **walking skeleton**: one Node 22 ESM process that loads and validates every secret/id from `process.env`, builds two Telegram clients, proves both are actually connected, logs it, and shuts both down cleanly on a signal — with nothing game-related yet. The whole phase is "standard patterns, low research risk" *except* for two well-known footguns that this research pins down precisely:

1. **grammY's `bot.start()` never resolves while polling runs** — it is verified against the grammY API reference that the returned Promise only resolves after `bot.stop()`. So readiness must be proven via `await bot.init()` (which calls `getMe` and sets `botInfo`) and then `bot.start()` is fired **without `await`**. The pre-existing project ARCHITECTURE.md still describes the *telegraf* idiom (`bot.launch()`); for grammY the correct calls are `bot.init()` / `bot.start({ onStart })` / `bot.stop()` — see §State of the Art.

2. **The GramJS user client must be connection-verified at boot** for D-01 fail-fast. `new TelegramClient(new StringSession(SESSION_KEY), apiId, apiHash, {...})` → `await client.connect()` → confirm with `await client.getMe()` (or `client.checkAuthorization()`); on shutdown `await client.disconnect()` (or `destroy()`). If `connect()`/`getMe()` rejects, the process refuses to start and names the user client.

Zod 4 already collects **all** issues by default (checks are "continuable"), which satisfies D-02 aggregate-all with no special configuration — `safeParse` + `z.prettifyError`/`z.treeifyError`. Doppler is transparent to the app: `doppler run -- <cmd>` injects secrets as env vars at process launch and the app just reads `process.env`, so the dotenv local fallback coexists for free.

**Primary recommendation:** Build a single `bootstrap()` composition root that (1) `loadConfig()` via Zod `safeParse` and exits non-zero with a prettified all-errors report on failure, (2) connects the GramJS user client and verifies with `getMe()`, (3) `await bot.init()` then logs both connected, (4) fires `bot.start()` unawaited, (5) installs `process.once('SIGINT'|'SIGTERM')` handlers that `bot.stop()` + `client.disconnect()` behind a `setTimeout(()=>process.exit(1), ~8000).unref()` hard-timeout. Order client connection **before** the unawaited `bot.start()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load & validate secrets/ids from env | Composition root (boot) | Config module | Read once at boot, inject downward; never read `process.env` deep in the tree |
| Hardcoded participant/admin/bot-id constants | Constants module (pure) | — | A product decision (part of the joke); no I/O, no env — keeps the secret↔constant boundary obvious (D-03) |
| Bot API connection (`BOT_TOKEN`) | grammY adapter | Composition root (start/stop) | grammY owns long-polling; root owns lifecycle wiring |
| MTProto user connection (`SESSION_KEY`) | GramJS adapter | Composition root (start/stop) | Account-level client; booted & verified only this phase, no feature wired |
| Non-blocking startup + readiness proof | Composition root | both adapters | Root sequences init/connect/getMe so "both connected" is provable before `bot.start()` is fired unawaited |
| Graceful shutdown + force-exit timeout | Composition root (lifecycle) | both adapters | Single owner of `process.once` signal handlers and the hard-timeout |
| Secret injection at runtime | Process launcher (Doppler/dotenv) | — | External to app code; app only ever reads `process.env` (D-08) |
| Session rotation | Standalone login helper script | Runbook (docs) | One-off executable; not part of the running process |
| Structured logging | pino logger module | all tiers | Inject a logger; redact `SESSION_KEY`/`BOT_TOKEN` |

## Standard Stack

> The project-level `.planning/research/STACK.md` and `.claude/CLAUDE.md` already locked the ecosystem. This section narrows to **only what Phase 1 installs/uses** and verifies current versions this session. **Do not re-survey alternatives** — the stack is locked.

### Core
| Library | Version (verified 2026-06-22) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| grammy | `^1.44` (latest 1.44.0) | Bot API client (`BOT_TOKEN`) | Locked in CLAUDE.md; clean TS types; `bot.init`/`bot.start`/`bot.stop` lifecycle [VERIFIED: npm registry] [CITED: grammy.dev/ref/core/bot] |
| telegram (GramJS) | `^2.26` (latest 2.26.22) | MTProto user client (`API_ID`/`API_HASH`/`StringSession`) | Locked; lowest porting risk from the original. Pulls native crypto (Debian slim, not Alpine — relevant in the later Docker pass) [VERIFIED: npm registry] [CITED: gram.js.org] |
| zod | `^4` (latest 4.4.3) | Aggregate-all env validation | Locked; collects all issues by default (D-02) [VERIFIED: npm registry] [CITED: zod.dev] |
| pino | `^10` (latest 10.3.1) | Structured boot logging | Locked in CLAUDE.md [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | `^17` (latest 17.4.2) | Local `.env` fallback only | Contributors not on Doppler; load before `loadConfig()` in dev. Doppler is primary (D-08) [VERIFIED: npm registry] |
| pino-pretty | latest | Pretty dev logs | **devDependency only**; pipe pino through it in dev |

### Dev / one-off
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | `^4` (latest 4.22.4) | Run TS directly (`dev`, `login` scripts) | dev/runtime-without-build; no type-check [VERIFIED: npm registry] |
| typescript | **pin `5.9`** (latest is 6.0.3 — DO NOT use) | Type-check + build | CLAUDE.md pins 5.9; 6.0 too new for the bot ecosystem types [VERIFIED: npm registry — 6.0.3 exists but is explicitly avoided] |
| input | `^1` (latest 1.0.1) | Terminal prompts for the login helper | **devDependency only**; used by `npm run login` to prompt phone/code, never by the running bot [VERIFIED: npm registry] [ASSUMED: that this specific `input` package is the one GramJS examples use — see Assumptions Log A1] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `input` for the login prompt | Node built-in `node:readline/promises` | Zero extra dependency; slightly more code. **Recommended fallback if `input` provenance is a concern** (see A1). GramJS `client.start` only needs `phoneNumber`/`phoneCode`/`password` to be async functions returning strings — any prompt source works. |
| dotenv | Node 22 native `--env-file=.env` | Node 22 can load `.env` without dotenv; but dotenv is locked in CLAUDE.md and is more portable across the `tsx`/`node` split. Keep dotenv. |

**Installation (Phase 1 only):**
```bash
npm install grammy telegram zod pino dotenv
npm install -D typescript@5.9 tsx pino-pretty input
```

**Version verification (run before pinning):**
```bash
npm view grammy version      # expect 1.44.x
npm view telegram version    # expect 2.26.x  (NOTE: last publish Feb 2025 — see Pitfall 5)
npm view zod version         # expect 4.x
npm view pino version        # expect 10.x
npm view typescript version  # 6.0.3 latest — PIN 5.9, do not install latest
```

`package.json` must set `"type": "module"` (lowdb v7 later + tsx are ESM-first; grammY/GramJS/zod all ESM-compatible).

## Package Legitimacy Audit

> Ran `gsd-tools query package-legitimacy check --ecosystem npm` + `npm view` per package this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| grammy | npm | created 2021-03; last publish 2026-06-14 | ~4.98M/wk | github.com/grammyjs/grammY | **SUS (false positive)** | **Approved.** Flagged only `too-new` because the seam keys off the *latest publish date*; the package is 5 years old with ~5M weekly downloads and an official repo. Safe. |
| telegram (GramJS) | npm | publish 2025-02-12 | ~293K/wk | github.com/gram-js/gramjs | OK | Approved (stale but proven — see Pitfall 5) |
| zod | npm | publish 2026-05-04 | ~206M/wk | github.com/colinhacks/zod | OK | Approved |
| pino | npm | publish 2026-02-09 | ~37.5M/wk | github.com/pinojs/pino | OK | Approved |
| dotenv | npm | mature | very high | github.com/motdotla/dotenv | OK (assumed mature) | Approved |
| input | npm | publish 2016-03 | ~38K/wk | github.com/callumlocke/input | OK (seam) | Approved **with caveat A1** — verify it is the prompt lib GramJS docs intend; `node:readline/promises` is the zero-dependency fallback |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `grammy` — verified false positive (latest-publish-date heuristic; established 5yr/5M-download package). No checkpoint needed.

## Architecture Patterns

### System Architecture Diagram

```
                 ┌────────────────────────────────────────────┐
   doppler run --│  PROCESS LAUNCH (Doppler injects env, OR    │  dev fallback: dotenv
   <cmd>         │  plain .env via dotenv) → process.env       │  loads .env into process.env
                 └───────────────────────┬────────────────────┘
                                         │ process.env (only read here)
                                         ▼
        ┌──────────────────────────────────────────────────────────────┐
        │              COMPOSITION ROOT  (src/main.ts: bootstrap)        │
        │  1. loadConfig()  ──Zod safeParse──▶ valid Config             │
        │        │ on failure: prettify ALL errors → log → exit(1)       │  (D-02)
        │        ▼                                                        │
        │  2. build pino logger (redact secrets)                         │
        │  3. user = buildUserClient(config)                            │
        │        await user.connect(); await user.getMe()  ── verify ──▶ │  (D-01 fail-fast)
        │  4. bot  = buildBotClient(config)                            │
        │        await bot.init()  (calls getMe, sets botInfo) ──verify─▶│  (D-01 fail-fast)
        │  5. log "both clients connected"                              │
        │  6. bot.start({ onStart })   ◀── NOT awaited (never resolves)  │  (footgun)
        │  7. installShutdown(bot, user)                               │
        └───────────────┬───────────────────────────┬──────────────────┘
                        │                             │
          ┌─────────────▼──────────┐    ┌─────────────▼───────────────┐
          │  grammY Bot (long poll)│    │  GramJS TelegramClient        │
          │  BOT_TOKEN             │    │  StringSession(SESSION_KEY)   │
          │  init/start/stop       │    │  connect/getMe/disconnect     │
          └────────────────────────┘    └───────────────────────────────┘

   ┌──────────────────────┐     ┌─────────────────────────────────────┐
   │ config/env (Zod)     │     │ SIGINT/SIGTERM → stop bot + disconnect│
   │ config/constants     │     │ user, behind setTimeout(...).unref()  │
   │ (participants/ids)   │     │ hard force-exit (D-05)                │
   └──────────────────────┘     └─────────────────────────────────────┘

   ──── login helper (separate entrypoint, NOT in the running process) ────
   src/scripts/login.ts: client.start({phoneNumber,phoneCode,password})
     → console.log(client.session.save())  → operator pastes into Doppler/.env
```

A reader can trace the primary path: env vars enter at launch → `loadConfig` validates → user client connects+verifies → bot inits+verifies → "both connected" logged → bot polls unawaited → signal triggers bounded shutdown.

### Recommended Project Structure
```
src/
├── main.ts                  # composition root: bootstrap() + installShutdown()
├── config/
│   ├── env.ts               # Zod schema + loadConfig() (safeParse, prettify-all, exit non-zero)
│   └── constants.ts         # participants table, LUX admin, MR_KEK_ID, trigger words (PURE)
├── logger.ts                # pino instance (redact SESSION_KEY/BOT_TOKEN); pino-pretty in dev
├── telegram/
│   ├── bot-client.ts        # buildBotClient(config): grammY Bot, init(), start(), stop()
│   └── user-client.ts       # buildUserClient(config): GramJS TelegramClient, connect/getMe/disconnect
└── scripts/
    └── login.ts             # standalone: interactive login → print fresh StringSession (CFG-03/D-04)
.env.example                 # authoritative list of required keys, NO real values (also Doppler schema)
README.md                    # run/setup section (Doppler path + plain-.env fallback + session gen)
docs/session-rotation.md     # runbook (CFG-03)
```
> Note: `domain/`, `persistence/`, `telegram/handlers/` from the project ARCHITECTURE.md are **Phase 2/3** — do not create them here.

### Pattern 1: Non-blocking dual-client startup with readiness proof
**What:** Verify each client is genuinely connected *before* declaring ready, but never `await` the long-poll loop.
**When to use:** The boot sequence (CFG-05, D-01).
**Example:**
```typescript
// src/main.ts
async function bootstrap() {
  const config = loadConfig();              // throws/exits if invalid (D-02)
  const log = createLogger(config);

  // 1) USER CLIENT first — connect + verify (fail-fast, D-01)
  const user = buildUserClient(config);
  await user.connect();                     // Promise<boolean>
  const userMe = await user.getMe();        // rejects if session invalid → process refuses to start
  log.info({ userId: userMe.id?.toString() }, "MTProto user client connected");

  // 2) BOT CLIENT — init() calls getMe + sets botInfo (this is the readiness signal)
  const bot = buildBotClient(config);
  await bot.init();                         // verified: fetches getMe, populates botInfo
  log.info({ botUsername: bot.botInfo.username }, "Bot API client connected");

  log.info("Both clients connected");

  // 3) Start polling — DO NOT await: bot.start() resolves only after bot.stop()
  bot.start({ onStart: (info) => log.info({ bot: info.username }, "long polling started") })
     .catch((err) => { log.fatal({ err }, "bot polling crashed"); process.exit(1); });

  installShutdown({ bot, user, log });
  return { bot, user };
}
```
**Source:** grammy.dev/ref/core/bot (start never resolves while polling; init fetches getMe/sets botInfo; onStart in PollingOptions) [CITED]; gram.js.org connect/getMe [CITED].

### Pattern 2: Aggregate-all env validation that names every missing var (D-02)
**What:** One Zod object schema, `safeParse`, and on failure print **all** issues then `process.exit(1)`.
**When to use:** `loadConfig()` at the very top of boot (CFG-01/CFG-02).
**Example:**
```typescript
// src/config/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  BOT_TOKEN:        z.string().min(1),
  API_ID:           z.coerce.number().int().positive(),   // Number(input)
  API_HASH:         z.string().min(1),
  SESSION_KEY:      z.string().min(1),
  MAIN_CHAT_ID:     z.coerce.number().int(),              // negative ok: -1001685837062
  RELAY_CHANNEL_ID: z.coerce.number().int(),
});
export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Zod 4 collects ALL issues by default (checks are "continuable")
    console.error("Invalid environment configuration:\n" + z.prettifyError(result.error));
    process.exit(1);                                       // non-zero, names every missing/invalid var
  }
  return result.data;
}
```
**Source:** zod.dev — safeParse returns ZodError with `.issues` (all issues); `z.prettifyError`/`z.treeifyError`; `z.coerce.number()` = `Number(input)`; checks continuable by default [CITED].
> Note on chat ids: Telegram supergroup/channel ids are large negatives (`-100…`). They fit JS `number` (< 2^53) so `z.coerce.number().int()` is safe; do **not** add `.positive()`.

### Pattern 3: Graceful shutdown with a guaranteed force-exit (D-05)
**What:** On SIGINT/SIGTERM, stop both clients, but a bounded `unref`'d timer guarantees the process can never hang.
**Example:**
```typescript
function installShutdown({ bot, user, log }: Deps) {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;                 // ignore repeat signals
    shuttingDown = true;
    log.info({ signal }, "shutting down");

    // Hard timeout: if cleanup hangs, force exit. unref() so the timer itself
    // never keeps the loop alive.
    const force = setTimeout(() => {
      log.error("shutdown timed out — forcing exit");
      process.exit(1);
    }, 8000);
    force.unref();

    try {
      await bot.stop();                       // graceful: stops getUpdates, confirms last update
      await user.disconnect();                // GramJS: disconnects senders
      log.info("clean shutdown complete");
      process.exit(0);
    } catch (err) {
      log.error({ err }, "error during shutdown");
      process.exit(1);
    }
  };
  process.once("SIGINT",  () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
```
**Source:** grammy.dev (`bot.stop()` graceful) [CITED]; GramJS `disconnect()` [CITED]; Node graceful-shutdown pattern with `setTimeout(...).unref()` + `process.once` [CITED: dev.to/axiom_agent graceful-shutdown].

### Pattern 4: Session-rotation login helper (CFG-03 / D-04)
**What:** A standalone tsx entrypoint that does the interactive GramJS login and prints a fresh StringSession to paste into Doppler/.env. Not part of the running bot.
**Example:**
```typescript
// src/scripts/login.ts   →  run via:  doppler run -- npm run login   (or plain: npm run login)
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";   // or node:readline/promises (see A1)

const apiId   = Number(process.env.API_ID);
const apiHash = String(process.env.API_HASH);

const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

await client.start({
  phoneNumber: async () => await input.text("Phone (international format): "),
  password:    async () => await input.text("2FA password (blank if none): "),
  phoneCode:   async () => await input.text("Login code from Telegram: "),
  onError:     (err) => console.error(err),
});

console.log("\nFresh StringSession (store as SESSION_KEY, NEVER commit):\n");
console.log(client.session.save());
await client.disconnect();
process.exit(0);
```
**Source:** gram.js.org/getting-started/authorization — exact `client.start({...})` + `client.session.save()` flow [CITED].

### Anti-Patterns to Avoid
- **`await bot.start()` in the boot sequence** — it never resolves while polling; the user client (if started after) never boots and the process appears to hang. Fire `bot.start()` unawaited; prove readiness with `bot.init()` instead. [grammY footgun — verified]
- **Using telegraf's `bot.launch()` from the old research** — that API is telegraf-specific; grammY uses `init`/`start`/`stop`. (ARCHITECTURE.md/PITFALLS.md still reference `bot.launch()` — stale; see §State of the Art.)
- **Reading `process.env` deep in the tree** — read once in `loadConfig()`, inject the typed `Config` downward (keeps the secret boundary auditable for CFG-01).
- **Hardcoding `SESSION_KEY` (or any secret) anywhere in source** — the original's exact bug (SPEC §3/§11.1). All from env.
- **Shutdown without a hard timeout** — if a client hangs, the process never dies; always pair cleanup with `setTimeout(...).unref()` → `process.exit`.
- **Logging the raw update / session / token** — redact `SESSION_KEY` and `BOT_TOKEN` in pino.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env validation + all-errors report | Manual `if (!process.env.X) missing.push(...)` loops | Zod `safeParse` + `z.prettifyError` | Zod already aggregates all issues, coerces types, and infers the `Config` type (D-02 for free) |
| Secret injection | A custom config-fetch/secret SDK call in app code | `doppler run -- <cmd>` (env injection) + dotenv fallback | App stays unchanged reading `process.env`; no SDK coupling (D-08) |
| Bot-connected check | Pinging Telegram manually | grammY `bot.init()` (calls getMe, sets botInfo) | Built-in readiness signal |
| User-client-connected check | Custom MTProto handshake probe | GramJS `connect()` + `getMe()`/`checkAuthorization()` | Built-in; rejects on a dead/invalid session |
| Interactive login prompts | Raw `process.stdin` parsing | `input` **or** `node:readline/promises` | GramJS `client.start` just needs async string-returning fns |
| Structured logging | `console.log` with manual JSON | pino (+ redact) | Locked; redaction prevents secret leakage |

**Key insight:** Phase 1 is almost entirely composition — every hard part (validation aggregation, readiness checks, secret injection, login) has a first-class library/CLI primitive. The only thing you write by hand is the *ordering* in `bootstrap()` and the force-exit timer.

## Runtime State Inventory

> This is a greenfield phase (no `src/` exists). It is **not** a rename/refactor of running systems — but it *establishes* the secret that one runtime-state item (the leaked session) must rotate. The full inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no `db.json` or datastore exists yet (Phase 2) | None |
| Live service config | **The leaked MTProto session is live on the original account.** The compromised `StringSession` from the old repo grants full account access until terminated. | **Rotation runbook (CFG-03):** terminate the old session in Telegram → Settings → Devices, generate a fresh string via `npm run login`, store as `SESSION_KEY` in Doppler. Hard launch gate (STATE.md blocker). |
| OS-registered state | None yet (Docker/VPS deferred, D-06). `Procfile` exists in repo but is from the old App Engine/Heroku setup and is out of scope this phase. | None this phase |
| Secrets/env vars | New env surface introduced: `BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`, `MAIN_CHAT_ID`, `RELAY_CHANNEL_ID`. The Doppler project/config must be created and populated. | Create Doppler config; populate `.env.example` as the schema; document in README |
| Build artifacts / installed packages | None — no `node_modules`/`dist` yet | `npm install` per §Standard Stack |

**The canonical question — after every file is updated, what runtime state still has the old secret?** → The **leaked session string on the real Telegram account**. Updating source to read from env does NOT invalidate the leaked string; it must be explicitly **terminated in Telegram and regenerated**. This is the one piece of true runtime state in this phase.

## Common Pitfalls

### Pitfall 1: `bot.start()` never resolves → startup hangs (the headline footgun)
**What goes wrong:** Awaiting `bot.start()` (or doing `await bot.start(); await user.connect()`) means the user client never connects; the process half-boots with no error.
**Why it happens:** `start()` returns a Promise that "will never resolve except if your bot is stopped" — it loops on `getUpdates` for the bot's lifetime. [CITED: grammy.dev/ref/core/bot]
**How to avoid:** Connect/verify the user client first, `await bot.init()` for the bot readiness signal, then call `bot.start({ onStart })` **unawaited** (attach `.catch` for crash logging).
**Warning signs:** Boot logs stop after "launching bot"; user client never connects.

### Pitfall 2: Treating GramJS `connect()` as proof of a valid session
**What goes wrong:** `connect()` can succeed at the transport layer even with a stale/invalid session; D-01 fail-fast then doesn't actually trip.
**Why it happens:** `connect()` returns `Promise<boolean>` for the connection, not authorization.
**How to avoid:** After `connect()`, call `await client.getMe()` (or `checkAuthorization()`); a rejection/false there means refuse to start and name the user client.
**Warning signs:** Process boots "connected" but the first MTProto call (later phases) fails with auth errors.

### Pitfall 3: Leaked StringSession not actually rotated (CFG-03 launch gate)
**What goes wrong:** Source is fixed to read from env, but the *old* leaked string still works because it was never terminated on the account — full account compromise persists.
**Why it happens:** "Move it to env" feels like the fix; terminating the live session is a separate manual step.
**How to avoid:** Runbook: Telegram → Settings → Devices → terminate the old session → `npm run login` → store new `SESSION_KEY` in Doppler → never commit. Add a secret scan (e.g. gitleaks) to CI so a session can't be committed again.
**Warning signs:** A base64-ish session literal anywhere in `git log -p`; a session that "just works" without env config.

### Pitfall 4: Zod chat-id coercion edge cases
**What goes wrong:** Using `.positive()` on `MAIN_CHAT_ID`/`RELAY_CHANNEL_ID` (which are large negatives like `-1001685837062`) silently fails validation; or `z.string()` leaves API_ID as a string and breaks the GramJS `Number` expectation.
**Why it happens:** Telegram supergroup/channel ids are negative; env values are always strings.
**How to avoid:** `z.coerce.number().int()` (no `.positive()`) for chat ids; `z.coerce.number().int().positive()` for `API_ID`. Values are < 2^53 so JS `number` is safe.
**Warning signs:** "missing/invalid MAIN_CHAT_ID" at boot despite a value being set; GramJS construction errors.

### Pitfall 5: GramJS is stale (last publish Feb 2025) on a fast-moving Node/TS stack
**What goes wrong:** `telegram` 2.26.22 hasn't published since 2025-02-12; on Node 22 ESM + TS 5.9 there can be type-resolution friction (e.g. deep import paths like `telegram/sessions/index.js`).
**Why it happens:** GramJS is JS-first with a slowed cadence (project STACK.md flagged this; mtcute is the documented migration target — out of scope here).
**How to avoid:** Pin `telegram@^2.26`; with `"moduleResolution":"NodeNext"`, import sessions via the explicit subpath (`telegram/sessions/index.js`) if the bare `telegram/sessions` import fails to resolve. Keep the user-client surface tiny (just connect/getMe/disconnect) so any future mtcute migration is contained.
**Warning signs:** `Cannot find module 'telegram/sessions'`; TS complaining about missing types on deep imports.

### Pitfall 6: ESM/NodeNext + tsx vs tsc divergence
**What goes wrong:** `tsx` runs without type-checking, so `npm run dev` works while `npm run build` (tsc) fails — or vice versa; relative imports missing `.js` extensions break under NodeNext.
**Why it happens:** tsx (esbuild) is lenient; tsc with `module:NodeNext` is strict about extensions and ESM semantics.
**How to avoid:** `tsconfig.json` with `"module":"NodeNext"`, `"moduleResolution":"NodeNext"`, `"target":"ES2022"`, `"strict":true`; write relative imports with explicit `.js` extensions; run `tsc --noEmit` in a `typecheck`/CI script so tsc remains the source of truth.
**Warning signs:** `dev` works but `build` errors on imports; `ERR_MODULE_NOT_FOUND` at `node dist/main.js`.

### Pitfall 7: Doppler/dotenv ordering and the fallback gap
**What goes wrong:** App assumes Doppler is always present; a contributor without Doppler gets cryptic "missing BOT_TOKEN" because dotenv was never loaded, or dotenv runs *after* `loadConfig()`.
**Why it happens:** Two injection paths (Doppler env vs `.env` file) with different load timing.
**How to avoid:** In dev, `import "dotenv/config"` (or `dotenv.config()`) at the very top of the entrypoint **before** `loadConfig()`; under `doppler run`, the vars are already in `process.env` so dotenv is a harmless no-op. Provide both wrapped (`doppler run -- ...`) and unwrapped npm scripts (or document `npm run dev:local`).
**Warning signs:** Works under `doppler run` but not under plain `npm run dev`.

## Code Examples

(Primary verified examples are inline in §Architecture Patterns 1–4: bootstrap/readiness, Zod loader, shutdown, login helper.)

### `bot.stop()` graceful semantics (for the shutdown handler)
```typescript
// grammY: stop() halts long polling gracefully — middleware in flight may finish,
// no further getUpdates, confirms last received update; does NOT wait for the full
// middleware stack. Returns Promise<void>.
await bot.stop();
// Source: grammy.dev/ref/core/bot  [CITED]
```

### GramJS reconnect-from-env + verify
```typescript
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const client = new TelegramClient(
  new StringSession(config.SESSION_KEY),
  config.API_ID, config.API_HASH,
  { connectionRetries: 5 },
);
await client.connect();                 // Promise<boolean>
const me = await client.getMe();        // rejects if session invalid → fail-fast (D-01)
// ...later, on shutdown:
await client.disconnect();              // disconnect() keeps handlers; destroy() removes them
// Source: gram.js.org  [CITED]
```

## State of the Art

| Old Approach (in project research / SPEC) | Current Approach (Phase 1) | When Changed | Impact |
|-------------------------------------------|----------------------------|--------------|--------|
| telegraf `bot.launch()` (ARCHITECTURE.md, PITFALLS.md §8) | grammY `bot.init()` + unawaited `bot.start()` + `bot.stop()` | Stack switched telegraf→grammY in CLAUDE.md | **The pre-existing architecture/pitfalls docs use telegraf method names.** Planner must use grammY's `init`/`start`/`stop`, not `launch`. Same footgun (never-resolving polling promise) applies to both. |
| `dotenv` as primary config (SPEC §4, original) | Doppler `doppler run --` as primary, dotenv as local fallback | D-08 | npm scripts wrapped with `doppler run --`; app code unchanged |
| Hardcoded session in `index.js` (SPEC §3/§11.1) | `SESSION_KEY` env + rotation runbook + login helper | This phase (CFG-01/CFG-03) | Hard launch gate before deploy |
| Original `telegram ^2.7` | `telegram ^2.26` (2.26.22) | — | Same library, far newer; but note it's stale since Feb 2025 (Pitfall 5) |

**Deprecated/outdated:**
- `bot.launch()` references in `.planning/research/ARCHITECTURE.md` (lines ~172–204, 280, 294) and `.planning/research/PITFALLS.md` (Pitfall 8) — these are telegraf-era; **do not copy them**. grammY equivalents are in this doc.
- `z.formatError()` — deprecated in Zod 4; use `z.treeifyError()` / `z.prettifyError()`.
- TypeScript 6.0.3 exists (latest) but is **explicitly not used** — pin 5.9.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `input` npm package (callumlocke, 1.0.1) is the prompt library GramJS examples intend for `client.start`. It passed the legitimacy seam (OK) but is low-traffic (~38K/wk). | Standard Stack / login helper | LOW — if it's the wrong/abandoned `input`, swap to Node built-in `node:readline/promises` (zero-dependency, recommended fallback). `client.start` only needs async string-returning functions, so the prompt source is interchangeable. Planner may prefer `readline/promises` outright to avoid the dependency. |
| A2 | Telegram chat/channel ids (`-1001685837062`, `-1001493761518`) fit within JS safe-integer range and are correctly stored/coerced as `number`. | Pattern 2 / Pitfall 4 | LOW — they are ~13 digits (< 2^53 ≈ 9e15), safe. Only a risk if a future id exceeds 2^53, in which case use `bigint`/string. |
| A3 | `bot.init()` performing the getMe call is a sufficient readiness signal for the Bot API client at boot. | Pattern 1 | LOW — verified `init()` calls getMe and sets botInfo; a failed token rejects there. Could additionally `await bot.api.getMe()` explicitly if a redundant check is wanted. |
| A4 | Doppler is already provisioned (account/project/config) by the operator; this phase consumes it, not sets it up programmatically. | D-08 / Environment Availability | LOW — Doppler is operator-side. If absent, the dotenv fallback path covers contributors; the README must document both. |

## Open Questions

1. **`input` vs `node:readline/promises` for the login helper.**
   - What we know: GramJS docs show `input.text(...)`; `input` is legitimate but low-traffic.
   - What's unclear: whether the team wants the extra dependency.
   - Recommendation: default to **`node:readline/promises`** (zero dependency) unless the planner wants doc-parity with GramJS examples; either satisfies CFG-03.

2. **Force-exit timeout duration (D-05 left to planner).**
   - What we know: industry pattern is 5–10s; `bot.stop()` + `client.disconnect()` are both fast in normal conditions.
   - Recommendation: **8s** `setTimeout(...).unref()` → `process.exit(1)`.

3. **Whether to also `await bot.api.getMe()` redundantly after `bot.init()`.**
   - Recommendation: not required (init already calls getMe); skip to keep boot lean, but logging `bot.botInfo.username` documents the connection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime (ESM, `--env-file` optional) | (verify on target) | needs 22.x | none — required |
| npm | Install deps | (verify) | — | none |
| Doppler CLI | D-08 primary secret injection | **Not verified on this machine** | — | **plain `.env` + dotenv** (documented fallback) |
| Telegram account (dedicated) | Generate fresh StringSession (CFG-03) | operator-provided | — | none — required to rotate |
| Internet → api.telegram.org & MTProto DCs | Both clients connect at boot | required at runtime | — | none — fail-fast (D-01) |

**Missing dependencies with no fallback:** Node 22 + a Telegram account for session generation (operator must provide).
**Missing dependencies with fallback:** Doppler CLI → plain `.env` via dotenv (the whole point of D-08's transparent design).

> Probe before planning execution (not run this session — greenfield, no target machine context):
> ```bash
> node --version          # expect v22.x
> npm --version
> command -v doppler && doppler --version   # optional; fallback exists
> ```

## Security Domain

> `security_enforcement: true`, ASVS level 1 in config — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | MTProto session = full-account bearer credential; rotate leaked key (CFG-03); dedicated account, not personal |
| V3 Session Management | yes | `StringSession` is the session; env-only, never in source; terminate-and-regenerate on rotation |
| V4 Access Control | partial (deferred) | Admin (LUX) is a hardcoded constant this phase; the `/start`/`/reset` admin *check* is Phase 3 |
| V5 Input Validation | yes | Zod validates the full env surface at boot (D-02); coerces/bounds numeric ids |
| V6 Cryptography | n/a (don't hand-roll) | GramJS owns MTProto crypto; never reimplement. No app-level crypto in this phase |
| V7 Errors & Logging | yes | pino with **redaction** of `SESSION_KEY`/`BOT_TOKEN`; never log raw update/session objects |
| V14 Configuration | yes | Secrets via env only (Doppler/dotenv); `.env.example` has no real values; add secret scanning (gitleaks) to prevent re-committing a session |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Committed/leaked StringSession → full account takeover | Spoofing / Elevation | Env-only secret; rotate the leaked key (terminate in Telegram + regenerate); gitleaks in CI (SPEC §11.1) |
| Secret leakage via logs | Information Disclosure | pino redaction of token/session; no raw-object logging |
| Boot with a half-valid config → wrong account/chat | Tampering | Zod fail-fast aggregate validation before any client builds (D-02) |
| User-account automation → Telegram ToS ban | Denial of Service (account loss) | Use a dedicated/expendable account; minimal user-client surface (LOW-confidence, anecdotal — see project PITFALLS.md Pitfall 3) |
| Process hang on shutdown → stuck/zombie deploy | Denial of Service | Bounded `setTimeout(...).unref()` force-exit (D-05) |

## Sources

### Primary (HIGH confidence)
- [grammy.dev/ref/core/bot](https://grammy.dev/ref/core/bot) — `start()` returned Promise never resolves while polling; `init(signal?)` calls getMe + sets botInfo (auto-called); `stop()` graceful; `isInited()`; `botInfo`; `PollingOptions.onStart`.
- [grammy.dev/guide/deployment-types](https://grammy.dev/guide/deployment-types) — `bot.start()` long-polling entry point; sequential processing.
- [gram.js.org/getting-started/authorization](https://gram.js.org/getting-started/authorization) — `new TelegramClient(new StringSession(""), apiId, apiHash, {connectionRetries})`, `client.start({phoneNumber,password,phoneCode,onError})`, `client.session.save()`, reconnect via `connect()`, verify via `getMe()`/`checkAuthorization()`.
- [gram.js.org TelegramClient ref](https://gram.js.org/beta/classes/TelegramClient.html) — `disconnect()` (keeps handlers) vs `destroy()` (removes handlers); `connect()` → `Promise<boolean>`.
- [zod.dev/error-formatting](https://zod.dev/error-formatting) + [zod.dev/api](https://zod.dev/api) — safeParse collects all issues (continuable checks); `z.flattenError`/`z.treeifyError`/`z.prettifyError`; `z.coerce.number()` = `Number(input)`; `z.string().min(1)`; `z.formatError` deprecated.
- npm registry (live `npm view`, 2026-06-22): grammy 1.44.0, telegram 2.26.22 (last publish 2025-02-12), zod 4.4.3, pino 10.3.1, dotenv 17.4.2, tsx 4.22.4, typescript 6.0.3 (pin 5.9), input 1.0.1.

### Secondary (MEDIUM confidence)
- [docs.doppler.com/docs/cli](https://docs.doppler.com/docs/cli) (via search digest) — `doppler run -- <cmd>` injects secrets as env vars into the subprocess at launch; `doppler login`/`doppler setup`; app reads `process.env`, no SDK; production via `DOPPLER_TOKEN`.
- [dev.to — Node.js Graceful Shutdown (SIGTERM)](https://dev.to/axiom_agent/nodejs-graceful-shutdown-the-right-way-sigterm-connection-draining-and-kubernetes-fp8) + [oneuptime graceful-shutdown handler](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) — `process.once` signal handlers, `server.close()` analog, hard `setTimeout(...process.exit())` safety net.

### Tertiary (LOW confidence)
- Project `.planning/research/PITFALLS.md` Pitfall 3 — user-account ToS ban risk (anecdotal).
- `input` package being GramJS's intended prompt lib (Assumption A1).

### Authoritative project references (HIGH)
- `SPEC.md` §3/§4/§6/§10/§11; `.planning/REQUIREMENTS.md` CFG-01..05; `.planning/phases/01-.../01-CONTEXT.md` D-01..D-08; `.claude/CLAUDE.md` locked stack.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions live-verified; choices locked in CLAUDE.md.
- Startup/shutdown architecture: HIGH — grammY `init`/`start`/`stop` semantics verified against the API reference; GramJS connect/getMe/disconnect verified.
- Env validation (Zod 4 aggregate-all): HIGH — verified Zod collects all issues by default.
- Doppler integration: MEDIUM — verified via docs/search digest, not run on this machine.
- Pitfalls: HIGH for the grammY/GramJS/Zod footguns; MEDIUM for Doppler ordering; LOW for the `input` provenance (A1) and ToS ban risk.

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (30 days — stable APIs; re-check grammY/GramJS if either publishes a major before planning execution)
