import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createTelegramClient, initTelegramClient } from './telegram/client';
import { initDatabase } from './db/database';
import { registerCommands } from './bot/commands';
import { handleKekMessage, handleNekekMessage } from './bot/handlers/kek.handler';
import { isSpecificMessage } from './utils/text';
import { KEK_KEYS, NEKEK_KEYS, KEK_CASINO_KEYS } from './constants';

async function main(): Promise<void> {
    const bot = new Telegraf(process.env.BOT_TOKEN!);
    createTelegramClient();

    await Promise.all([
        initTelegramClient(),
        initDatabase(),
    ]);

    registerCommands(bot);

    bot.on('message', async ctx => {
        const message = ctx.message as any;

        if (isSpecificMessage(message, KEK_KEYS)) {
            await handleKekMessage(ctx);
        } else if (isSpecificMessage(message, NEKEK_KEYS)) {
            await handleNekekMessage(ctx);
        }
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await bot.launch();
    console.log('🤖 Мистер Кек V2.0 запущен!');
}

main().catch(console.error);
