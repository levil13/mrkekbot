import { Context, Telegraf } from 'telegraf';
import { getDb, resetDatabase } from '../../db/database';
import { getTelegramClient } from '../../telegram/client';
import { collectUserStats } from '../../utils/users';
import { handleKekCasino } from '../handlers/casino.handler';
import { COMMANDS_TEXT, KEK_CASINO_KEYS, KEK_KEYS, NEKEK_KEYS, STATS_TITLE, USERS, WELCOME_MESSAGE } from '../../constants';

export function registerCommands(bot: Telegraf): void {
    bot.start(onStart);
    bot.command('help', ctx => ctx.reply(COMMANDS_TEXT));
    bot.command('commands', ctx => ctx.reply(COMMANDS_TEXT));
    bot.command('keys', ctx => ctx.reply(
        `Отправить кек: ${ KEK_KEYS.join(', ') }\nЗабрать кек: ${ NEKEK_KEYS.join(', ') }\nКек казино: ${ KEK_CASINO_KEYS.join(', ') }`
    ));
    bot.command('stats', onStats);
    bot.command('reset', onReset);
    bot.command('kekcasino', handleKekCasino);
}

async function onStart(ctx: Context): Promise<void> {
    const userId = (ctx.message as any).from.id;
    if (userId !== USERS.LUX.id) {
        await ctx.reply(`${ findNameById(userId) }, ты шо поц? Я разрешаю себя перезагружать только Лукасу`);
        return;
    }

    const db = getDb();
    await ctx.replyWithHTML(WELCOME_MESSAGE + 'На данный момент статистика Кеказны следующая:\n\n' + collectUserStats(db.data!.users));
}

async function onStats(ctx: Context): Promise<void> {
    const db = getDb();
    if (!db.data?.users) {
        await ctx.reply('Пажжи, людей не могу найти, сначала нужно написать /start');
        return;
    }
    await ctx.replyWithHTML(STATS_TITLE + collectUserStats(db.data.users));
}

async function onReset(ctx: Context): Promise<void> {
    const userId = (ctx.message as any).from.id;
    if (userId !== USERS.LUX.id) {
        await ctx.reply(`${ findNameById(userId) }, ты шо поц? Только Лукас может ресетить`);
        return;
    }
    await resetDatabase(getTelegramClient());
    await ctx.reply('Ресетнул лохов');
}


function findNameById(id: number): string {
    return Object.values(USERS).find(u => u.id == id)?.name ?? 'Незнакомец';
}
