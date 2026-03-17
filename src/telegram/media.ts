import { Api } from 'telegram';
import { Context } from 'telegraf';
import { getTelegramClient } from './client';
import { ANIME_KONFA_ID } from '../constants';
import { User } from '../db/models';
import { getDb } from '../db/database';
import { extractFileId } from '../bot/handlers/ban-media.handler';

const PAGE_SIZE = 100;

/**
 * Загружает одну страницу медиа из канала начиная с случайного offset.
 * Не загружает ВСЕ медиа рекурсивно — достаточно одной страницы для рандома.
 */
export async function loadRandomMediaPage(): Promise<Api.messages.ChannelMessages> {
    const client = getTelegramClient();

    // Сначала узнаём общее количество медиа в канале
    const countResult = await client.invoke(new Api.messages.Search({
        q: '',
        peer: new Api.PeerChannel({ channelId: ANIME_KONFA_ID as any }),
        filter: new Api.InputMessagesFilterPhotoVideo(),
        offsetId: 0,
        addOffset: 0,
        limit: 1,
    })) as Api.messages.ChannelMessages;

    const totalCount = countResult.count;

    if (totalCount === 0) {
        return countResult; // пустой результат
    }

    // Берём случайное смещение чтобы не грузить всё с начала
    const randomOffset = Math.floor(Math.random() * Math.max(0, totalCount - PAGE_SIZE));

    return await client.invoke(new Api.messages.Search({
        q: '',
        peer: new Api.PeerChannel({ channelId: ANIME_KONFA_ID as any }),
        filter: new Api.InputMessagesFilterPhotoVideo(),
        offsetId: 0,
        addOffset: randomOffset,
        limit: PAGE_SIZE,
    })) as Api.messages.ChannelMessages;
}

export async function forwardRandomKek(
    ctx: Context,
    requester: User
): Promise<boolean> {
    const client = getTelegramClient();

    try {
        const allMedia = await loadRandomMediaPage();

        if (!allMedia.messages.length) {
            await ctx.reply('Не нашел медиа в канале :< Кек возвращаю');
            return false;
        }

        const db = getDb();
        const bannedIds = new Set((db.data?.bannedMedia ?? []).map(b => b.fileId));

        const available = allMedia.messages.filter(msg => {
            const fileId = extractFileId((msg as Api.Message).media);
            return fileId ? !bannedIds.has(fileId) : true;
        });

        if (!available.length) {
            await ctx.reply('Все мемы на этой странице забанены, бля. Попробуй ещё раз, подберу другие');
            return false;
        }

        const randomIndex = Math.floor(Math.random() * available.length);
        const randomMessage = available[randomIndex] as Api.Message;

        if (!randomMessage?.media) {
            await ctx.reply('Попался пустой пост, попробуй ещё раз. Кек возвращаю');
            return false;
        }

        await client.invoke(new Api.messages.SendMedia({
            peer: new Api.PeerChannel({ channelId: ANIME_KONFA_ID as any }),
            media: randomMessage.media as any,
            message: `Дебик ${requester.name} решил сыграть в Кеказино\n\nВзнос: 1 кек\n\nЗагружаю...`,
        }))

        // const sentMsgId = (sent.updates[0] as Api.UpdateMessageID).id;
        // await ctx.telegram.copyMessage(Number(ANIME_KONFA_ID), Number(ANIME_KONFA_ID), sentMsgId);

        return true;
    } catch (err) {
        console.error('forwardRandomKek error:', err);
        await ctx.reply('Не загрузить рандомный мем :< Попробуй ещё раз. Кек возвращаю');
        return false;
    }
}
