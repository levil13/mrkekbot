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

    const isKekMsg = isSpecificMessage(currentMessage.text, constants.kekKeys);
    const isNekekMsg = isSpecificMessage(currentMessage.text, constants.nekekKeys);

    if (isKekMsg) {
        await processKekMessage(currentMessage, previousMessage, ctx);
    } else {
        localDB.prevMessage = currentMessage;
        updateDB();
    }

    if (isNekekMsg) {
        await processNekekMessage(currentMessage, ctx);
    }
});

bot.launch();

async function onBotStart(ctx) {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await initDB(ctx);
    await ctx.replyWithHTML(constants.welcomeMessage);
}

async function onBotStats(ctx) {
    if (!localDB.users) {
        ctx.reply('Пажжи, людей не могу найти, сначала нужно написать /start');
        return;
    }
    await ctx.replyWithHTML(constants.statsTitle + collectUserStats(localDB.users));
}

async function onBotReset(ctx) {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }

    await initUsers(ctx);
    ctx.reply('Ресетнул лохов');
}

function processWrongUser(userId, ctx) {
    const user = findUserById(userId);
    ctx.reply(`${user.name}, ты шо поц? Я разрешаю себя перезагружать только Лукасу`);
}

async function initUsers(ctx) {
    const usersAdmins = await getUserAdmins(ctx.message.chat, ctx);
    localDB.users = usersAdmins.filter(admin => !admin.user.is_bot).map(userAdm => {
        const user = findUserById(userAdm.user.id);
        return {...user, kekNumber: 100, lastKekGivenToId: null};
    });
    updateDB();
}

async function getUserAdmins(chatId, ctx) {
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

function collectUserStats(users) {
    return users
        .sort((user1, user2) => {
            if (user1.kekNumber < user2.kekNumber) return 1;
            if (user1.kekNumber > user2.kekNumber) return -1;
            return 0;
        })
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
    let user = Object.values(constants.users).find(user => user.id === userId);
    if (!user) user = constants.users.KALASH;
    return user;
}

function normalizeText(text) {
    return text.toLowerCase().replace(/\s/g, '');
}

function isSpecificMessage(text, specificKeys) {
    if (!text) return false;
    return specificKeys.includes(normalizeText(text));
}

async function processKekMessage(currentMessage, previousMessage, ctx) {
    if (!localDB.users) {
        ctx.reply('Не могу отдать кек, юзеров нема, нужно написать /start');
    }
    const currentUserId = currentMessage.from.id;
    let previousUserId = getPreviousUserId(currentMessage, previousMessage, ctx);

    if (previousUserId === currentUserId) {
        ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
        return;
    }

    await giveKek(currentUserId, previousUserId, ctx);
}

async function processNekekMessage(currentMessage, ctx) {
    if (!localDB.users) {
        ctx.reply('Не могу забрать кек, юзеров нема, нужно написать /start');
    }
    const currentUserId = currentMessage.from.id;

    await revertKek(currentUserId, ctx);
}

function getPreviousUserId(currentMessage, previousMessage, ctx) {
    if (currentMessage.reply_to_message) {
        if (currentMessage.reply_to_message.from.is_bot) {
            ctx.reply('Бля ну какой поц додумался боту поставить кек?\nБля ну сам виноват, перенаправляю Лукасу');
            return constants.users.LUX.id;
        }
        return currentMessage.reply_to_message.from.id;
    } else if (previousMessage) {
        return previousMessage.from.id;
    } else {
        ctx.reply('Первый кек всегда Люксу');
        return constants.users.LUX.id;
    }
}

async function giveKek(fromUserId, toUserId, ctx) {
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

    fromUser.lastKekGivenToId = toUserId;

    updateDB();

    await ctx.replyWithHTML(`Дебик <b>${fromUser.name}</b> задонатил кек дебику <b>${toUser.name}</b> \n\n`);
}

async function revertKek(fromUserId, ctx) {
    const fromUser = localDB.users.find(user => user.id === fromUserId);
    if (!fromUser.lastKekGivenToId) {
        ctx.reply('Ты еще никому не давал кеков поц, шо ты отжать пытаешься?');
        return;
    }
    const toUser = localDB.users.find(user => user.id === fromUser.lastKekGivenToId);

    if (!fromUser || !toUser) {
        ctx.reply('Не могу отправить кек, кто-то из дебиков не найден, нужно чтоб все были админами');
        return;
    }

    if (fromUserId.kekNumber <= 0) {
        ctx.reply('У этого бимжа не осталось кеков на счету, так что сорян, кек отправлен не будет');
        return;
    }

    ++fromUser.kekNumber;
    --toUser.kekNumber;
    fromUser.lastKekGivenToId = null;

    updateDB();

    await ctx.replyWithHTML(
        `Дебик <b>${fromUser.name}</b> успешно отжал свой кек у <b>${toUser.name}</b> \n\n` +
        `Знайте терь шо он крыса такая`
    );
}

async function initDB(ctx) {
    localDB = JSON.parse(fs.readFileSync('db.json', {encoding: 'utf8'}));
    if (!localDB.users?.length) {
        await initUsers(ctx);
    }
}

function updateDB() {
    fs.writeFileSync('db.json', JSON.stringify(localDB));
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
