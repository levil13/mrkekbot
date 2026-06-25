/**
 * Interactive MTProto login helper (CFG-03, D-04).
 *
 * Standalone tsx entrypoint — NOT imported by the running bot. Run it once to
 * mint a fresh `StringSession` after the leaked session has been terminated in
 * Telegram (see docs/session-rotation.md). Usage:
 *
 *   npm run login          # doppler run -- tsx src/scripts/login.ts
 *   npm run login:local    # plain .env / shell env
 *
 * It reads API_ID/API_HASH from process.env (no hardcoded credential), runs the
 * interactive GramJS login, and prints the resulting StringSession to STDOUT
 * ONLY. The session is never written to a file — copy it into Doppler/.env as
 * SESSION_KEY and never commit it.
 */
import { TelegramClient } from "telegram"
// Explicit NodeNext subpath (RESEARCH Pitfall 5).
import { StringSession } from "telegram/sessions/index.js"
// Zero-dependency terminal prompts (RESEARCH Open Question 1 — preferred over
// the third-party `input` package).
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

const PROXY_SETTINGS = { ip: '127.0.0.1', port: 10808, socksType: 5 as 5 }

async function main(): Promise<void> {
    const apiId = Number(process.env.API_ID)
    const apiHash = String(process.env.API_HASH ?? "")
    if (!Number.isInteger(apiId) || apiId <= 0 || apiHash.length === 0) {
        console.error(
            "API_ID and API_HASH must be set in the environment (Doppler or .env) before running login.",
        )
        process.exit(1)
    }

    const rl = createInterface({ input, output })

    // Start from an EMPTY session — this is a fresh login, not a reconnect.
    // No proxy
    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5
    })

    // Yes proxy
    // const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    //     connectionRetries: 5, proxy: PROXY_SETTINGS
    // })

    try {
        await client.start({
            phoneNumber: async () =>
                (await rl.question("Phone (international format, e.g. +123456789): ")).trim(),
            password: async () =>
                (await rl.question("2FA password (leave blank if none): ")).trim(),
            phoneCode: async () =>
                (await rl.question("Login code from Telegram: ")).trim(),
            onError: (err) => console.error("login error:", err),
        })

        // Print to STDOUT only — never persist to a tracked file.
        console.log(
            "\n=== Fresh StringSession — store as SESSION_KEY in Doppler/.env, NEVER commit ===\n",
        )
        console.log(client.session.save())
        console.log("\n=== end StringSession ===\n")
    } finally {
        rl.close()
        await client.disconnect()
    }

    process.exit(0)
}

main().catch((err: unknown) => {
    console.error("fatal: login failed", err)
    process.exit(1)
})
