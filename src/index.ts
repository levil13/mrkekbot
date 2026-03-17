import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createTelegramClient, initTelegramClient } from './telegram/client';
import { initDatabase } from './db/database';
import { registerCommands } from './bot/commands';
import { handleKekMessage, handleNekekMessage } from './bot/handlers/kek.handler';
import { handleBanMedia } from './bot/handlers/ban-media.handler';
import { isSpecificMessage } from './utils/text';
import { KEK_KEYS, NEKEK_KEYS } from './constants';

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
        const text: string = message.text ?? message.caption ?? '';

        if (isSpecificMessage(message, KEK_KEYS)) {
            await handleKekMessage(ctx);
        } else if (isSpecificMessage(message, NEKEK_KEYS)) {
            await handleNekekMessage(ctx);
        } else if (text.trim() === '#кал') {
            await handleBanMedia(ctx);
        }
    });

    bot.catch((err, ctx) => {
        console.error(`Ошибка при обработке обновления от ${ctx.from?.id}:`, err);
        ctx.reply('Ай млять, маслину поймал (сламалси)').catch(() => {});
    });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await bot.launch();
    console.log('🤖 Мистер Кек V2.0 запущен!');
}

main().catch(console.error);
