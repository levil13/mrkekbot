import { Context } from 'telegraf';
import { Api } from 'telegram';
import { getTelegramClient } from '../../telegram/client';
import { clearOldMessagesWithKek, getDb } from '../../db/database';
import { findUserById } from '../../utils/users';
import { isSpecificMessage } from '../../utils/text';
import { KEK_KEYS, MR_KEK_ID, NEKEK_KEYS, USERS } from '../../constants';

export async function handleKekMessage(ctx: Context): Promise<void> {
    const message = ctx.message as any;
    const messageToKek = await getMessageToKek(message);
    const messageToKekId: number = messageToKek.message_id ?? messageToKek.id;
    const messageToKekAuthor = getMessageAuthor(messageToKek, ctx);

    if (!messageToKekAuthor) return;

    if (messageToKekAuthor.id === message.from.id) {
        await ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
        return;
    }

    if (isSpecificMessage(messageToKek, KEK_KEYS)) return;

    const db = getDb();
    const messageInDb = db.data!.messagesWithKek.find(
        msg => (msg.message_id ?? msg.id) == messageToKekId
    );

    const success = await giveKek(message.from.id, messageToKekAuthor.id, messageToKekId, ctx);

    if (success) {
        if (messageInDb) {
            if (!messageInDb.kekedUsers.includes(message.from.id)) {
                messageInDb.kekedUsers.push(message.from.id);
            }
        } else {
            db.data!.messagesWithKek.push({ ...messageToKek, kekedUsers: [message.from.id] });
        }
        await db.write();

        if (messageInDb?.kekedUsers.length === 3) {
            const tripleKekGainer = findUserById(messageToKek.from?.id ?? messageToKek.fromId?.userId);
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
    fromUser.lastKekGivenTo = { userId: toUserId, messageId };

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

    const messageInDb = db.data!.messagesWithKek.find(
        msg => (msg.message_id ?? msg.id) == fromUser.lastKekGivenTo!.messageId
    );

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

async function getMessageToKek(currentMessage: any): Promise<any> {
    if (currentMessage.reply_to_message) {
        return currentMessage.reply_to_message;
    }
    return getPreviousMessage(currentMessage.message_id, currentMessage.chat.id);
}

async function getPreviousMessage(currentMessageId: number, channelId: number): Promise<any> {
    const client = getTelegramClient();
    const history = await client.invoke(new Api.messages.GetHistory({
        peer: new Api.PeerChannel({ channelId: channelId as any }),
        maxId: currentMessageId,
        minId: currentMessageId - 2,
        limit: 10,
        offsetId: 0,
        offsetDate: 0,
        addOffset: 0,
        hash: 0 as any,
    })) as Api.messages.ChannelMessages;

    const messages = history.messages.filter((msg): msg is Api.Message => {
        if (!(msg instanceof Api.Message)) return false;
        if (msg.fromId instanceof Api.PeerUser && msg.fromId.userId.toString() === MR_KEK_ID.toString()) {
            return /\([0-9]+\)/.test(msg.message ?? '');
        }
        return true;
    });

    if (!messages.length || isSpecificMessage({ message: (messages[0] as Api.Message).message }, [...KEK_KEYS, ...NEKEK_KEYS])) {
        return getPreviousMessage(currentMessageId - 1, channelId);
    }

    return messages[0];
}

function getMessageAuthor(message: any, ctx: Context): { id: number; name: string } | undefined {
    const isBot = message.from?.is_bot;
    const isFromMrKek = message.fromId?.userId == MR_KEK_ID;

    if (isBot || isFromMrKek) {
        const text = message.message || message.text || message.caption;
        const match = /\([0-9]+\)/.exec(text ?? '');
        if (match) {
            return findUserById(Number(match[0].slice(1, -1)));
        }
        ctx.reply('Бля ну какой поц додумался боту поставить кек?\nПеренаправляю Лукасу');
        return findUserById(USERS.LUX.id);
    }

    return findUserById(message.from?.id ?? message.fromId?.userId);
}
