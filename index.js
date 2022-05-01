const {Telegraf} = require('telegraf');
const constants = require('./constants');
const fs = require("fs");
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

let localDB = {};

bot.start(async (ctx) => await onBotStart(ctx));
bot.help((ctx) => ctx.reply(constants.helpMessage));

bot.command('stats', async (ctx) => await onBotStats(ctx));
bot.command('keys', async (ctx) => ctx.reply('Чтобы отправить кек можно написать: ' + constants.kekKeys.join(', ')));
bot.command('commands', async (ctx) => ctx.reply(constants.commands));
bot.command('reset', async (ctx) => await onBotReset(ctx));

bot.on('message', async (ctx) => {
    const currentMessage = ctx.message;
    const previousMessage = localDB.prevMessage;

    const isKekMsg = isKekMessage(currentMessage.text);
    if (!isKekMsg) {
        localDB.prevMessage = currentMessage;
        updateDB();
    }

    if (!previousMessage) return;

    if (isKekMsg) {
        await processKekMessage(currentMessage, previousMessage, ctx);
    }
});

bot.launch();

const onBotStart = async (ctx) => {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await initDB(ctx);
    await ctx.replyWithHTML(constants.welcomeMessage);
}

const onBotStats = async (ctx) => {
    if (!localDB.users) {
        ctx.reply('Пажжи, людей не могу найти, сначала нужно написать /start');
        return;
    }
    await ctx.replyWithHTML(constants.statsTitle + collectUserStats(localDB.users));
}

const onBotReset = async (ctx) => {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await initUsers(ctx);
    ctx.reply('Ресетнул лохов');
}

const processWrongUser = (userId, ctx) => {
    const user = findUserById(userId);
    ctx.reply(`${user.name}, ты шо поц? Я разрешаю себя перезагружать только Лукасу`);
}

const initUsers = async (ctx) => {
    const usersAdmins = await getUserAdmins(ctx.message.chat, ctx);
    localDB.users = usersAdmins.map(userAdm => {
        const user = findUserById(userAdm.user.id);
        return {...user, kekNumber: 100};
    });
    updateDB();
}

const getUserAdmins = async (chatId, ctx) => {
    try {
        const chatAdmins = await ctx.getChatAdministrators(chatId);
        if (!chatAdmins?.length) {
            ctx.reply('Шот нема админов, я хз шо за хуйня');
        }
        return chatAdmins || [];
    } catch (e) {
        ctx.reply('Не получилось считать админов, я хз шо за хуйня');
        return [];
    }
}

const collectUserStats = (users) => {
    return users
        .sort((user1, user2) => {
            if (user1.kekNumber < user2.kekNumber) return 1;
            if (user1.kekNumber > user2.kekNumber) return -1;
            return 0;
        })
        .map(user => getUserTitle(user) + ` - <b>${user.kekNumber}</b> кеков`)
        .join('\n');
}

const getUserTitle = (user) => {
    if (user.id === constants.users.LUX.id) {
        return `У самого ахуенного поскотовца <b>${user.name}</b>`
    } else {
        return `У дебикса <b>${user.name}</b>`
    }
}

const findUserById = (userId) => {
    let user = Object.values(constants.users).find(user => user.id === userId);
    if (!user) user = constants.users.KALASH;
    return user;
}

const isKekMessage = (text) => {
    if (!text) return false;
    const normalizedText = text.toLowerCase().replace(/\s/g, '');
    return constants.kekKeys.includes(normalizedText);
}

const processKekMessage = async (currentMessage, previousMessage, ctx) => {
    const currentUserId = currentMessage.from.id;
    let previousUserId = currentMessage.reply_to_message?.from?.id || previousMessage.from.id;

    if (currentMessage.reply_to_message?.from?.is_bot) {
        ctx.reply('Бля ну какой поц додумался боту поставить кек?\nБля ну сам виноват, перенаправляю Лукасу');
        previousUserId = constants.users.LUX.id;
    }

    if (previousUserId === currentUserId) {
        ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
        return;
    }

    await giveKek(currentUserId, previousUserId, ctx);
}

const giveKek = async (fromUserId, toUserId, ctx) => {
    const fromUser = localDB.users.find(user => user.id === fromUserId);
    const toUser = localDB.users.find(user => user.id === toUserId);

    if (!fromUser || !toUser) {
        ctx.reply('Не могу отправить кек, кто-то из дебиков не найден, нужно чтоб все были админами');
        return;
    }

    if (fromUserId.kekNumber <= 0) {
        ctx.reply('У этого бимжа не осталось кеков на счету, так что сорян, кек отправлен не будет');
        return;
    }

    --fromUser.kekNumber;
    ++toUser.kekNumber;

    updateDB();

    await ctx.replyWithHTML(
        `Дебик <b>${fromUser.name}</b> задонатил кек дебику <b>${toUser.name}</b> \n\n` +
        `Теперь у дебика <b>${fromUser.name}</b>  - <b>${fromUser.kekNumber}</b> кеков \n\n` +
        `А у дебика <b>${toUser.name}</b> - <b>${toUser.kekNumber}</b> кеков`
    );
}

const initDB = async (ctx) => {
    localDB = JSON.parse(fs.readFileSync('db.json', {encoding: 'utf8'}));
    if (!localDB.users?.length) {
        await initUsers(ctx);
    }
}

const updateDB = () => {
    fs.writeFileSync('db.json', JSON.stringify(localDB));
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
