import { Api } from 'telegram';
import { Context } from 'telegraf';
import { getTelegramClient } from './client';
import { ANIME_KONFA_ID } from '../constants';
import { User } from '../db/models';
import { getDb } from '../db/database';

export async function loadAllMedia(offsetId: number): Promise<Api.messages.TypeMessages> {
    const client = getTelegramClient();
    const allMedia = await client.invoke(new Api.messages.Search({
        q: '',
        peer: new Api.PeerChannel({ channelId: ANIME_KONFA_ID as any }),
        filter: new Api.InputMessagesFilterPhotoVideo(),
        offsetId,
        addOffset: 0,
        limit: 100,
    })) as Api.messages.ChannelMessages;

    if (allMedia.messages.length < allMedia.count) {
        const lastId = allMedia.messages[allMedia.messages.length - 1]?.id;
        if (lastId) {
            const nextPage = await loadAllMedia(lastId) as Api.messages.ChannelMessages;
            allMedia.messages.push(...nextPage.messages);
        }
    }

    return allMedia;
}

export async function forwardRandomKek(
    allMedia: Api.messages.ChannelMessages,
    ctx: Context,
    requester: User
): Promise<void> {
    const client = getTelegramClient();
    const db = getDb();

    try {
        const randomIndex = Math.floor(Math.random() * allMedia.messages.length);
        const randomMessage = allMedia.messages[randomIndex] as Api.Message;

        const sent = await client.invoke(new Api.messages.SendMedia({
            peer: new Api.PeerChannel({ channelId: ANIME_KONFA_ID as any }),
            media: randomMessage.media as any,
            message: `Игрок: ${requester.name}, (${requester.id})`,
        })) as Api.Updates;

        const sentMsgId = (sent.updates[0] as Api.UpdateMessageID).id;
        await ctx.telegram.copyMessage(ctx.chat!.id, Number(ANIME_KONFA_ID), sentMsgId);
    } catch {
        await ctx.reply('Не загрузить рандомный мем :< Попробуй еще раз.\nКек твой я тебе возвращаю');
        requester.kekNumber++;
        await db.write();
    }
}
