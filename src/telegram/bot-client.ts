/**
 * grammY Bot API client adapter (CFG-05, D-01).
 *
 * Tiny lifecycle surface only — NO message/command handlers are registered
 * here (those are Phase 3). The composition root drives readiness and the
 * long-poll loop:
 *   - `bot.init()` is the readiness signal: it calls getMe and populates
 *     `bot.botInfo`, and rejects on an invalid BOT_TOKEN (D-01 fail-fast).
 *   - `bot.start()` is the long-poll loop and MUST be fired WITHOUT await by
 *     the caller — its Promise never resolves while polling (RESEARCH
 *     Pitfall 1). This module therefore never awaits `start()` and never
 *     calls it itself.
 */
import { Bot } from "grammy"
import type { Config } from "../config/env.js"
import { SocksAgent } from '../scripts/socks-agent.js'

/**
 * Construct the grammY {@link Bot} from {@link Config}. Returns the bot so the
 * composition root can `await bot.init()` (readiness), fire `bot.start({...})`
 * unawaited (long poll), and `bot.stop()` on shutdown.
 */

const PROXY_SETTINGS = {
    client: {
        baseFetchConfig: {
            agent: new SocksAgent('socks5://127.0.0.1:10808'),
            compress: true
        }
    }
}

export function buildBotClient(config: Config): Bot {
    // No Proxy
    return new Bot(config.BOT_TOKEN);

    // Yes Proxy
    // return new Bot(config.BOT_TOKEN, PROXY_SETTINGS)
}
