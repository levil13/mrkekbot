import { Context } from 'telegraf';
import { clearOldMessagesWithKek, getDb } from '../../db/database';
import { findUserById } from '../../utils/users';
import { lastMessage } from '../../index';
import { MR_KEK_ID, USERS } from '../../constants';

export async function handleKekMessage(ctx: Context): Promise<void> {
    const message = ctx.message as any;
    const { messageId, authorId, date } = lastMessage

    if (!authorId) return;

    if (authorId === message.from.id) {
        await ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
        return;
    }

    if (authorId.toString() === MR_KEK_ID) {
        await ctx.reply('Бля ну какой поц додумался боту поставить кек?\nНу я просто в А Х У Е, перенаправляю Лукасу');
        await giveKek(message.from.id, USERS.LUX.id, messageId, ctx);

        return;
    }

    const db = getDb();
    const messageInDb = db.data!.messagesWithKek.find(msg => (msg.messageId) == messageId);

    const success = await giveKek(message.from.id, authorId, messageId, ctx);

    if (success) {
        if (messageInDb) {
            if (!messageInDb.kekedUsers.includes(message.from.id)) {
                messageInDb.kekedUsers.push(message.from.id);
            }
        } else {
            db.data!.messagesWithKek.push({ messageId, date, authorId, kekedUsers: [message.from.id] });
        }
        await db.write();

        if (messageInDb?.kekedUsers.length === 3) {
            const tripleKekGainer = findUserById(authorId);
            await ctx.reply(`Ох нихуя, ${ tripleKekGainer?.name } БОГОПОДОБЕН, он ловит три кека в ряд!`);
            db.data!.messagesWithKek.splice(db.data!.messagesWithKek.indexOf(messageInDb), 1);
            await db.write();
        }
    }

    clearOldMessagesWithKek();
}

export async function handleNekekMessage(ctx: Context): Promise<void> {
    const db = getDb();
    if (!db.data?.users) {
        await ctx.reply('Не могу забрать кек, юзеров нема, нужно написать /start');
        return;
    }
    const message = ctx.message as any;
    await revertKek(message.from.id, ctx);
}

async function giveKek(
    fromUserId: number,
    toUserId: number,
    messageId: number,
    ctx: Context
): Promise<boolean> {
    const db = getDb();
    const fromUser = db.data!.users.find(u => u.id == fromUserId);
    const toUser = db.data!.users.find(u => u.id == toUserId);

    if (!fromUser || !toUser) {
        await ctx.reply('Не могу отправить кек, кто-то из дебиков не найден');
        return false;
    }

    if (fromUser.kekNumber <= 0) {
        await ctx.reply('У этого бимжа не осталось кеков на счету, так что сорян, кек отправлен не будет');
        return false;
    }

    fromUser.kekNumber--;
    toUser.kekNumber++;
    fromUser.lastKekGivenTo = { ...fromUser.lastKekGivenTo, userId: toUserId, messageId };

    await db.write();
    await ctx.replyWithHTML(`Дебик <b>${ fromUser.name }</b> задонатил кек дебику <b>${ toUser.name }</b>`);
    return true;
}

async function revertKek(fromUserId: number, ctx: Context): Promise<void> {
    const db = getDb();
    const fromUser = db.data!.users.find(u => u.id == fromUserId);

    if (!fromUser?.lastKekGivenTo) {
        await ctx.reply('Ты еще никому не давал кеков поц, шо ты отжать пытаешься?');
        return;
    }

    const toUser = db.data!.users.find(u => u.id == fromUser.lastKekGivenTo!.userId);

    if (!fromUser || !toUser) {
        await ctx.reply('Не могу найти кого-то из дебиков');
        return;
    }

    if (toUser.kekNumber <= 0) {
        await ctx.reply('У этого бимжа не осталось кеков, так что сорян, отжать не выйдет, придется накуканивать');
        return;
    }

    fromUser.kekNumber++;
    toUser.kekNumber--;

    const messageInDb = db.data!.messagesWithKek.find(msg => (msg.messageId) == fromUser.lastKekGivenTo!.messageId);

    if (messageInDb) {
        messageInDb.kekedUsers = messageInDb.kekedUsers.filter(id => id != fromUserId);
        if (!messageInDb.kekedUsers.length) {
            db.data!.messagesWithKek.splice(db.data!.messagesWithKek.indexOf(messageInDb), 1);
        }
    }

    fromUser.lastKekGivenTo = null;
    await db.write();
    await ctx.replyWithHTML(`Дебик <b>${ fromUser.name }</b> успешно отжал свой кек у <b>${ toUser.name }</b>\n\nЗнайте терь шо он крыса такая`);
}
