# Mr. Kek (Мистер Кек)

A Telegram group-chat bot for a closed friend group: members award each other
virtual "keks" for funny messages, and the bot tracks every member's balance and
a shared leaderboard ("Кеказна"). This is a from-scratch TypeScript rewrite of an
older Node.js bot (behaviour reverse-engineered in [`SPEC.md`](./SPEC.md)).

The bot runs as a single long-lived process with **two** Telegram clients:

- a **grammY** Bot API client (`BOT_TOKEN`), and
- a **GramJS** MTProto user client (`API_ID` / `API_HASH` / `SESSION_KEY`).

Both must connect at boot or the process refuses to start (fail-fast).

## Prerequisites

- **Node.js 22.x** (active LTS) — check with `node --version`.
- **npm** (bundled with Node).
- A **Telegram bot token** from [@BotFather](https://t.me/BotFather).
- **MTProto API credentials** (`API_ID` / `API_HASH`) from
  <https://my.telegram.org> → API development tools.
- A fresh MTProto **`SESSION_KEY`** — see
  [Generating a session](#generating-a-session) below.

## Install

```bash
npm install
```

## Configuration

The app reads all secrets and ids from `process.env` (never from source). The
authoritative list of required keys is [`.env.example`](./.env.example):

| Variable           | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `BOT_TOKEN`        | Bot API token from @BotFather                          |
| `API_ID`           | MTProto app API id (my.telegram.org)                   |
| `API_HASH`         | MTProto app API hash (my.telegram.org)                 |
| `SESSION_KEY`      | MTProto StringSession (generated, rotated — see below) |
| `MAIN_CHAT_ID`     | Main group chat id (large negative supergroup id)      |
| `RELAY_CHANNEL_ID` | Casino relay channel id (large negative channel id)    |

There are two ways to provide these.

### Option A — Doppler (primary)

Secrets are injected as env vars at process launch; the app code is unchanged.

```bash
# one-time setup
doppler login
doppler setup          # select the project + config for this repo

# run (Doppler injects the env vars into the subprocess)
doppler run -- npm run dev
```

The `dev`, `start`, and `login` npm scripts are already wrapped with
`doppler run --`, so `npm run dev` uses Doppler automatically.

### Option B — plain `.env` fallback

If you do not use Doppler, copy the example and fill it in:

```bash
cp .env.example .env
# edit .env with your real values (the file is git-ignored)
```

Then use the `:local` script variants, which skip the Doppler wrapper and rely
on the `dotenv` fallback loaded at startup:

```bash
npm run dev:local
```

## Generating a session

The MTProto `SESSION_KEY` is generated interactively and must be **rotated**
because the original repo leaked one. Run:

```bash
npm run login          # via Doppler
# or
npm run login:local    # plain .env / shell env
```

It prompts for phone / login code / optional 2FA password and prints a fresh
`StringSession` to the terminal — store it as `SESSION_KEY` and never commit it.
Full terminate-then-regenerate procedure:
[`docs/session-rotation.md`](./docs/session-rotation.md).

## Running

```bash
npm run dev          # dev (tsx watch) via Doppler
npm run dev:local    # dev (tsx watch) via plain .env

npm run build        # type-check + emit JS to dist/
npm run start        # run built dist/main.js via Doppler
npm run start:local  # run built dist/main.js via plain .env

npm run typecheck    # tsc --noEmit (source of truth for type errors)
```

On a successful boot the logs show the user client connected, the bot connected,
then **`Both clients connected`**, then the long-poll loop. Send `Ctrl-C`
(SIGINT) or `SIGTERM` to shut down cleanly — both clients stop and the process
exits within ~8s (bounded force-exit guarantees it can never hang).

## npm scripts

| Script         | What it does                                       |
| -------------- | -------------------------------------------------- |
| `dev`          | `doppler run -- tsx watch src/main.ts`             |
| `dev:local`    | `tsx watch src/main.ts` (plain `.env`)             |
| `build`        | `tsc` — emit JS to `dist/`                         |
| `typecheck`    | `tsc --noEmit`                                     |
| `start`        | `doppler run -- node dist/main.js`                 |
| `start:local`  | `node dist/main.js` (plain `.env`)                 |
| `login`        | `doppler run -- tsx src/scripts/login.ts`          |
| `login:local`  | `tsx src/scripts/login.ts` (plain `.env`)          |
