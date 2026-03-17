import { Context } from 'telegraf';
import { Api } from 'telegram';
import { getDb } from '../../db/database';

// Маркер по которому определяем что сообщение из казино
const CASINO_MESSAGE_MARKER = 'Игрок:';

export function extractFileId(media: unknown): string | null {
    if (!media) return null;

    // Фото
    if (media instanceof Api.MessageMediaPhoto && media.photo instanceof Api.Photo) {
        return String(media.photo.id);
    }

    // Видео, гифки, документы
    if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
        return String(media.document.id);
    }

    return null;
}

export async function handleBanMedia(ctx: Context): Promise<void> {
    const db = getDb();
    const message = ctx.message as any;
    const repliedTo = message?.reply_to_message;

    if (!repliedTo) {
        await ctx.reply('Шо ты баниш в пустоту, поц? Реплаем на мем давай');
        return;
    }

    // Проверяем что реплай на сообщение из казино
    const repliedText: string = repliedTo.caption ?? repliedTo.text ?? '';
    if (!repliedText.includes(CASINO_MESSAGE_MARKER)) {
        await ctx.reply('Бля, это не казиношный мем, нечего его банить');
        return;
    }

    // Достаём file_id из медиа через Bot API объект
    const photo = repliedTo.photo;
    const video = repliedTo.video;
    const animation = repliedTo.animation;
    const document = repliedTo.document;

    let fileId: string | null = null;

    if (photo?.length) {
        fileId = photo[photo.length - 1].file_unique_id;
    } else if (video) {
        fileId = video.file_unique_id;
    } else if (animation) {
        fileId = animation.file_unique_id;
    } else if (document) {
        fileId = document.file_unique_id;
    }

    if (!fileId) {
        await ctx.reply('Не смогла опознать мем, он такой страшный что даже забанить нельзя');
        return;
    }

    if (!db.data!.bannedMedia) {
        db.data!.bannedMedia = [];
    }

    if (db.data!.bannedMedia.some(b => b.fileId === fileId)) {
        await ctx.reply('Этот кал уже забанен, дважды не прожуёшь');
        return;
    }

    db.data!.bannedMedia.push({ fileId });
    await db.write();

    await ctx.reply('Мем забанен, больше в казино не попадётся. Кал вынесен 🗑️');
}
