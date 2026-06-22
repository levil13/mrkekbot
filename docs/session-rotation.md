# MTProto Session Rotation Runbook (CFG-03)

The bot's user client authenticates to Telegram with an MTProto **StringSession**
— a full-account bearer credential. A session string was leaked in the original
codebase (SPEC §3 / §11.1), so it **must be rotated before any deploy**. This is a
hard launch gate.

> **Critical:** Moving the session into an env var does **not** invalidate the
> leaked string. The old session keeps working until you **terminate it
> server-side in Telegram**. Terminate first, then regenerate.

---

## 1. Terminate the OLD leaked session (do this first)

In the Telegram app for the bot's account:

1. Open **Settings → Devices** (also shown as **Active Sessions**).
2. Find the old/compromised session (any session you do not recognise, or the
   one that was previously used by the bot).
3. **Terminate** it. If in doubt, **Terminate all other sessions** to revoke
   every credential except the device you are using.

Until this step is done, the leaked credential still grants full account access.

## 2. Ensure API credentials are set

The login helper reads `API_ID` and `API_HASH` from the environment. Get them
from <https://my.telegram.org> → **API development tools**, then make them
available either via Doppler or a local `.env` (see the README setup section).

## 3. Generate a fresh StringSession

Run the interactive login helper:

```bash
npm run login          # via Doppler (doppler run -- tsx src/scripts/login.ts)
# or, without Doppler:
npm run login:local    # reads API_ID/API_HASH from .env / shell env
```

You will be prompted for:

- your phone number (international format),
- the login code Telegram sends you,
- your 2FA password (leave blank if you have none).

On success it prints a fresh `StringSession` to the terminal **(stdout only —
it is never written to a file)**.

## 4. Store the new session as `SESSION_KEY`

Copy the printed string and store it as `SESSION_KEY`:

- **Doppler (primary):** add/update `SESSION_KEY` in the project config.
- **Local fallback:** put it in your `.env` (which is git-ignored).

**Never commit the session string.** It is a full-account credential.

## 5. Confirm the bot boots with the new session

With all six env vars set (`BOT_TOKEN`, `API_ID`, `API_HASH`, `SESSION_KEY`,
`MAIN_CHAT_ID`, `RELAY_CHANNEL_ID`):

```bash
npm run dev          # or npm run dev:local
```

Expected logs: the MTProto user client connects, the Bot API client connects,
then exactly **`Both clients connected`**, then the long-poll loop starts — and
the process does not hang at boot. Stop it with `Ctrl-C` (SIGINT); it should log
a clean shutdown and exit within ~8s.

## 6. Launch gate

Do **not** deploy until the leaked session has been terminated (step 1) and the
running bot uses the freshly generated `SESSION_KEY`. This corresponds to the
open blocker tracked in `.planning/STATE.md`.
