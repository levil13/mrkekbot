import { Context } from 'telegraf';
import { getDb } from '../../db/database';
import { forwardRandomKek } from '../../telegram/media';

export async function handleKekCasino(ctx: Context): Promise<void> {
    const db = getDb();
    if (!db.data?.users?.length) {
        await ctx.reply('Сначала нужно написать /start');
        return;
    }

    const requester = db.data.users.find(u => u.id == (ctx.from?.id ?? 0));
    if (!requester) {
        await ctx.reply('Ты кто такой вообще?');
        return;
    }

    if (requester.kekNumber <= 0) {
        await ctx.reply(`${ requester.name }, у тебя нет кеков бимж, сыграть не получится`);
        return;
    }

    const success = await forwardRandomKek(ctx, requester);

    if (success) {
        requester.kekNumber--;
    }

    await db.write();
}
