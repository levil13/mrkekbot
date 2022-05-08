const {Telegraf} = require('telegraf');
const constants = require('./constants');
const {TelegramClient, Api} = require("telegram");
const {StringSession} = require("telegram/sessions");
const {join} = require("path");
const {JSONFile, Low} = require("lowdb");
require('dotenv').config();

const sessionKey = '1AgAOMTQ5LjE1NC4xNjcuNTEBuzeLMQO4Dt/XzOq8QNRuwAt8MzHUWzRGIppp9we+kHlYjj8E/jHP9SCFszsJXQpn5URTQ7xeQrDt1fxg3TV2ZctgeZ7FLYgagQ2xreMtNHcdxSuye9j6Ycq6oCB0u4ei+pXBdJb6MmCDTpyYo3NP/epyZRjm7nZN4fYaz5LV4f9WLGjOXbF8xkPAN5h6U2fop7fJdqThinc3Lx7bfErzzgIO/+3XAosz3h2VIGmwLJzNdvhQhy/uGbOEF9MX4a0Q/6JQou4o4UIFA3ATprz/Sk0h4Wm4pkV5DL8/nAnf2HyCadmtChn+7FLOiML5raf5mMsKG0HGA83eGUsS/Q4Wl64='

const bot = new Telegraf(process.env.BOT_TOKEN);
const botUserClient = new TelegramClient(new StringSession(sessionKey), +process.env.API_ID, process.env.API_HASH, {connectionRetries: 5});

let localDB = {};

Promise.all([initTelegramClient(), initBot()])
    .then(async () => {
        localDB = new Low(new JSONFile(join(__dirname, 'db.json')));
        await localDB.read();
        if (!localDB.data) {
            await initDB();
        }
        console.log('Bot started');
    });

async function initTelegramClient() {
    return botUserClient.start();
}

async function initBot() {
    return bot.launch();
}

bot.start(async (ctx) => await onBotStart(ctx));

bot.command('help', (ctx) => ctx.reply(constants.commands));
bot.command('stats', async (ctx) => await onBotStats(ctx));
bot.command('keys', async (ctx) => {
    ctx.reply(`Отправить кек: ${constants.kekKeys.join(', ')}\nЗабрать кек: ${constants.nekekKeys.join(', ')}\nКек казино: ${constants.kekCasinoKeys.join(', ')}`)
});
bot.command('commands', async (ctx) => ctx.reply(constants.commands));
bot.command('reset', async (ctx) => await onBotReset(ctx));
bot.command('kekcasino', async (ctx) => await onRandomKek(ctx));

bot.on('message', async (ctx) => {
    const currentMessage = ctx.message;

    const isKekMsg = isSpecificMessage(currentMessage, constants.kekKeys);
    const isNekekMsg = isSpecificMessage(currentMessage, constants.nekekKeys);
    const isKekCasinoMsg = isSpecificMessage(currentMessage, constants.kekCasinoKeys);

    // const reactions = await botUserClient.invoke(new Api.messages.GetAvailableReactions({}));

    // const test2 = await botUserClient.invoke(new Api.messages.SendReaction({
    //     peer: new Api.PeerChannel({channelId: currentMessage.chat.id}),
    //     msgId: currentMessage.message_id,
    //     reaction: reactions.reactions[0].reaction
    // }));

    if (isKekMsg) {
        await processKekMessage(currentMessage, ctx);
        clearOldMessagesWithKek();
    }

    if (isNekekMsg) {
        await processNekekMessage(currentMessage, ctx);
    }

    if (isKekCasinoMsg) {
        await onRandomKek(ctx);
    }
});

async function onRandomKek(ctx) {
    if (!localDB.data?.users?.length) {
        ctx.reply('Сначала нужно написать /start');
        return;
    }
    const requester = localDB.data.users.find(user => user.id == ctx.from.id);
    ctx.reply(`Дебик ${requester.name} решил сыграть в Кеказино\n\nВзнос: 1 кек\n\nЗагружаю...`);
    --requester.kekNumber;
    await localDB.write();

    const allMedia = await loadMedia(ctx.message.message_id);
    await forwardRandomKek(allMedia, ctx, requester);
}

async function forwardRandomKek(allMedia, ctx, requester) {
    try {
        const randomNumber = Math.floor(Math.random() * (allMedia.messages.length - 1));
        const message = await botUserClient.invoke(
            new Api.messages.SendMedia({
                peer: new Api.PeerChannel({channelId: -1001493761518}),
                media: allMedia.messages[randomNumber].media,
                message: `Игрок: ${requester.name}, (${requester.id})`
            })
        );
        await ctx.telegram.copyMessage(ctx.chat.id, -1001493761518, message.updates[0].id);
    } catch (e) {
        ctx.reply('Не загрузить рандомный мем :< Попробуй еще раз.\nКек твой я тебе возвращаю');
        ++requester.kekNumber;
        await localDB.write();
    }
}

async function loadMedia(offsetId) {
    const allMedia = await botUserClient.invoke(new Api.messages.Search({
        q: '',
        peer: new Api.PeerChannel({channelId: constants.animeKonfaId}),
        filter: new Api.InputMessagesFilterPhotoVideo(),
        offsetId,
        addOffset: 0,
        limit: 100
    }));
    if (allMedia.messages.length < allMedia.count) {
        const lastMediaId = allMedia.messages[allMedia.messages.length - 1]?.id;
        if (!lastMediaId) return allMedia;

        const nextPageMedia = await loadMedia(lastMediaId);
        allMedia.messages.push(...nextPageMedia.messages);
    }
    return allMedia;
}

async function onBotStart(ctx) {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await ctx.replyWithHTML(constants.welcomeMessage + 'На данный момент статистика Кеказны следующая:\n\n' + collectUserStats(localDB.data.users));
}

async function onBotStats(ctx) {
    if (!localDB.data.users) {
        ctx.reply('Пажжи, людей не могу найти, сначала нужно написать /start');
        return;
    }
    await ctx.replyWithHTML(constants.statsTitle + collectUserStats(localDB.data.users));
}

async function onBotReset(ctx) {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await resetStats();

    ctx.reply('Ресетнул лохов');
}

function processWrongUser(userId, ctx) {
    const user = findUserById(userId);
    ctx.reply(`${user.name}, ты шо поц? Я разрешаю себя перезагружать только Лукасу`);
}

function collectUserStats(users) {
    return users
        .sort((user1, user2) => user2.kekNumber < user1.kekNumber)
        .map(user => getUserTitle(user) + ` - <b>${user.kekNumber}</b> кеков`)
        .join('\n');
}

function getUserTitle(user) {
    if (user.id === constants.users.LUX.id) {
        return `У самого ахуенного поскотовца <b>${user.name}</b>`
    } else {
        return `У дебикса <b>${user.name}</b>`
    }
}

function findUserById(userId) {
    return Object.values(constants.users).find(user => user.id == userId);
}

function normalizeText(text) {
    return text.toLowerCase().replace(/\s/g, '');
}

function isSpecificMessage(message, specificKeys) {
    const text = message.message || message.text;
    if (!text) return false;
    return specificKeys.includes(normalizeText(text));
}

async function processKekMessage(kekMessage, ctx) {
    const messageToKek = await getMessageToKek(kekMessage);
    const messageToKekId = messageToKek.message_id || messageToKek.id;
    const messageToKekAuthor = getMessageAuthor(messageToKek, ctx);
    const messageToKekInDB = localDB.data?.messagesWithKek?.find(msg => {
        const messageId = msg.message_id || msg.id;
        return messageId == messageToKekId;
    });
    if (messageToKekAuthor.id === kekMessage.from.id) {
        ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
        return;
    }

    if (!isSpecificMessage(messageToKek, constants.kekKeys)) {
        const giveKekSuccess = await giveKek(kekMessage.from.id, messageToKekAuthor.id, messageToKekId, ctx);
        if (giveKekSuccess) {
            if (messageToKekInDB) {
                if (!messageToKekInDB.kekedUsers.includes(kekMessage.from.id)) {
                    messageToKekInDB.kekedUsers.push(kekMessage.from.id);
                }
            } else {
                localDB.data.messagesWithKek.push({...messageToKek, kekedUsers: [kekMessage.from.id]});
            }
            await localDB.write();
        }
    }

    if (messageToKekInDB?.kekedUsers?.length === 3) {
        const tripleKekGainer = findUserById(messageToKek.from?.id || messageToKek.fromId?.userId);
        ctx.reply(`Ох нихуя, ${tripleKekGainer.name} БОГОПОДОБЕН, он ловит три кека в ряд!`);

        localDB.data.messagesWithKek.splice(localDB.data.messagesWithKek.indexOf(messageToKekInDB), 1);
        await localDB.write();
    }
}

async function processNekekMessage(currentMessage, ctx) {
    if (!localDB.data.users) {
        ctx.reply('Не могу забрать кек, юзеров нема, нужно написать /start');
    }
    const currentUserId = currentMessage.from.id;

    await revertKek(currentUserId, ctx);
}

function clearOldMessagesWithKek() {
    if (!localDB.data?.messagesWithKek?.length) return;

    const dayInMillis = 86400000;
    const currentDateInMillis = new Date().getTime();
    localDB.data.messagesWithKek = localDB.data.messagesWithKek.filter(msg => dayInMillis > currentDateInMillis - (msg.date * 1000));
}

async function getPreviousKekedMessage(currentMessageId, channelId) {
    let previousMessages = await getMessagesBetween(currentMessageId, currentMessageId - 2, channelId);
    if (!previousMessages.length || isSpecificMessage(previousMessages[0], [...constants.kekKeys, ...constants.nekekKeys])) {
        previousMessages = [await getPreviousKekedMessage(currentMessageId - 1, channelId)];
    }
    return previousMessages[0];
}

async function getMessagesBetween(maxId, minId, channelId) {
    const previousMessages = await botUserClient.invoke(new Api.messages.GetHistory({
        peer: new Api.PeerChannel({channelId}),
        maxId: maxId,
        minId: minId
    }));
    return previousMessages.messages.filter(msg => {
        if (msg.fromId.userId == constants.mrKekId) {
            const anyUserId = /\([0-9]+\)/.exec(msg.text);
            return !!anyUserId;
        }
        return true;
    });
}

async function getMessageToKek(currentMessage) {
    if (currentMessage.reply_to_message) {
        return currentMessage.reply_to_message;
    } else {
        return await getPreviousKekedMessage(currentMessage.message_id, currentMessage.chat.id)
    }
}

function getMessageAuthor(message, ctx) {
    if (message.from?.is_bot || message.fromId?.userId == constants.mrKekId) {
        const text = message.message || message.text || message.caption
        const userIdExec = /\([0-9]+\)/.exec(text);
        if (!!userIdExec) {
            return findUserById(userIdExec[0].slice(1, -1));
        }
        ctx.reply('Бля ну какой поц додумался боту поставить кек?\nБля ну сам виноват, перенаправляю Лукасу');
        return findUserById(constants.users.LUX.id);
    }
    return findUserById(message.from?.id || message.fromId?.userId);
}

async function giveKek(fromUserId, toUserId, messageId, ctx) {
    const fromUser = localDB.data.users.find(user => user.id == fromUserId);
    const toUser = localDB.data.users.find(user => user.id == toUserId);

    if (!fromUser || !toUser) {
        ctx.reply('Не могу отправить кек, кто-то из дебиков не найден');
        return false;
    }

    if (fromUserId.kekNumber <= 0) {
        ctx.reply('У этого бимжа не осталось кеков на счету, так что сорян, кек отправлен не будет');
        return false;
    }

    --fromUser.kekNumber;
    ++toUser.kekNumber;

    fromUser.lastKekGivenTo = {userId: toUserId, messageId};

    await localDB.write();

    await ctx.replyWithHTML(`Дебик <b>${fromUser.name}</b> задонатил кек дебику <b>${toUser.name}</b> \n\n`);
    return true;
}

async function revertKek(fromUserId, ctx) {
    const fromUser = localDB.data.users.find(user => user.id == fromUserId);
    if (!fromUser.lastKekGivenTo) {
        ctx.reply('Ты еще никому не давал кеков поц, шо ты отжать пытаешься?');
        return;
    }
    const toUser = localDB.data.users.find(user => user.id == fromUser.lastKekGivenTo.userId);

    if (!fromUser || !toUser) {
        ctx.reply('Не могу отправить кек, кто-то из дебиков не найден');
        return;
    }

    if (toUser.kekNumber <= 0) {
        ctx.reply('У этого бимжа не осталось кеков на счету, так что сорян, кек отжат не будет, отныне поц в твоем рабстве пока не выплатит кек');
        return;
    }

    ++fromUser.kekNumber;
    --toUser.kekNumber;

    const messageToKekInDB = localDB.data?.messagesWithKek?.find(msg => {
        const messageId = msg.message_id || msg.id;
        return messageId == fromUser.lastKekGivenTo.messageId;
    });

    if (messageToKekInDB) {
        messageToKekInDB.kekedUsers = messageToKekInDB.kekedUsers.filter(user => user != fromUserId);
        if (!messageToKekInDB.kekedUsers.length) {
            localDB.data.messagesWithKek.splice(localDB.data.messagesWithKek.indexOf(messageToKekInDB), 1);
        }
    }

    fromUser.lastKekGivenTo = null;

    await localDB.write();

    await ctx.replyWithHTML
    (`Дебик <b>${fromUser.name}</b> успешно отжал свой кек у <b>${toUser.name}</b> \n\n` + `Знайте терь шо он крыса такая`);
}

async function initDB() {
    localDB.data = {users: await getUsers(), messagesWithKek: []};
    await localDB.write();
}

async function getUsers() {
    const chatParticipants = await getChannelParticipants(constants.animeKonfaId);
    return chatParticipants.map(realUser => {
        const user = findUserById(realUser.id.value);
        return {...user, kekNumber: 100, lastKekGivenTo: null};
    });
}

async function getChannelParticipants(channelId) {
    const chatParticipants = await botUserClient.invoke(new Api.channels.GetParticipants({
        channel: channelId,
        filter: new Api.ChannelParticipantsRecent({})
    }));
    return chatParticipants.users.filter(user => !user.bot);
}

async function resetStats() {
    if (localDB.data.users) {
        localDB.data.users.map(user => ({...user, kekNumber: 100, lastKekGivenTo: null}));
    } else {
        localDB.data.users = await getUsers();
    }
    localDB.write();
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
