import 'dotenv/config';
import http from 'http';
import { Context, Telegraf } from 'telegraf';
import { createTelegramClient, initTelegramClient } from './telegram/client';
import { initDatabase } from './db/database';
import { registerCommands } from './bot/commands';
import { handleKekMessage, handleNekekMessage } from './bot/handlers/kek.handler';
import { handleBanMedia } from './bot/handlers/ban-media.handler';
import { handleKekCasino } from './bot/handlers/casino.handler';
import { isSpecificMessage } from './utils/text';
import { KEK_CASINO_KEYS, KEK_KEYS, KAL_KEYS, NEKEK_KEYS } from './constants';

export let lastMessage: { authorId: number, messageId: number, date: number } = { authorId: 0, messageId: 0, date: 0 }

class MyContext extends Context {
    async replyWithHTML(text: string) {
        const message = await super.replyWithHTML(text);
        lastMessage = { messageId: message.message_id, authorId: message.from!.id, date: message.date }
        return message
    }

    async reply(text: string, ...args: any[]) {
        const message = await super.reply(text, ...args);
        lastMessage = { messageId: message.message_id, authorId: message.from!.id, date: message.date }
        return message
    }
}

async function main(): Promise<void> {
    const bot = new Telegraf(process.env.BOT_TOKEN!, { contextType: MyContext });
    createTelegramClient();

    await Promise.all([
        initTelegramClient(),
        initDatabase(),
    ]);

    registerCommands(bot);

    bot.on('message', async ctx => {
        const { message_id, text, date, from } = ctx.message as any;

        if (isSpecificMessage(text, KEK_KEYS)) {
            await handleKekMessage(ctx);
        } else if (isSpecificMessage(text, NEKEK_KEYS)) {
            await handleNekekMessage(ctx);
        } else if (isSpecificMessage(text, KEK_CASINO_KEYS)) {
            await handleKekCasino(ctx);
        } else if (isSpecificMessage(text, KAL_KEYS)) {
            await handleBanMedia(ctx);
        } else {
            lastMessage = { authorId: from.id, messageId: message_id, date };
        }
    });

    bot.catch((err, ctx) => {
        console.error(`Ошибка при обработке обновления от ${ ctx.from?.id }:`, err);
        ctx.reply('Ай млять, маслину поймал (сламалси)')
    });

    // Health check endpoint для мониторинга
    const healthPort = Number(process.env.HEALTH_PORT ?? 3002);
    http.createServer((_, res) => {
        res.writeHead(200);
        res.end('OK');
    }).listen(healthPort);

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await bot.launch({ dropPendingUpdates: true });
    console.log(`🤖 Мистер Кек V2.0 запущен! Health check: http://localhost:${ healthPort }/`);
}

main().catch(console.error);
