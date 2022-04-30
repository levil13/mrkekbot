const {Telegraf} = require('telegraf')
const constants = require('./constants');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.context.db = {users: null, prevMessage: null};

bot.start(async (ctx) => await onBotStart(ctx));
bot.help((ctx) => ctx.reply(constants.helpMessage));

bot.command('stats', async (ctx) => {
    if (!ctx.db.users) {
        ctx.reply('Пажжи сначала нужно написать /start')
    }
    await ctx.replyWithHTML(constants.statsTitle + collectUserStats(ctx.db.users))
});
bot.command('keys', async (ctx) => ctx.reply('Чтобы отправить кек можно написать: ' + constants.kekKeys.join(', ')));

bot.on('message', async (ctx) => {
    const currentMessage = ctx.message;
    const prevMessage = ctx.db.prevMessage;
    ctx.db.prevMessage = currentMessage;
    if (!prevMessage) return;

    const text = currentMessage.text;
    const userId = currentMessage.from.id;
    const prevUserId = currentMessage.reply_to_message?.from?.id || prevMessage.from.id;
    if (constants.kekKeys.includes(text.toLowerCase())) {
        if (prevUserId === userId) {
            ctx.reply('Ты шо пес ахуел сам себе кеки ставить?');
            return;
        }
        const fromUser = ctx.db.users.find(user => user.id === userId);
        const toUser = ctx.db.users.find(user => user.id === prevUserId);

        if (!fromUser || !toUser) {
            ctx.reply('Кто-то из дебиков не найден, нужно чтоб все были админами')
        }

        ++toUser.kekNumber;
        --toUser.kekNumber;

        await ctx.replyWithHTML(
            `<b>${fromUser.name}</b> задонатил кек дебику <b>${toUser.name}</b> \n\n` +
            `Теперь у дебика <b>${fromUser.name}</b>  - <b>${fromUser.kekNumber}</b> кеков \n\n` +
            `А у дебика <b>${toUser.name}</b> - <b>${toUser.kekNumber}</b> кеков`
        );
    }
});

bot.launch();

const onBotStart = async (ctx) => {
    const userId = ctx.message.from.id;
    if (userId !== constants.users.LUX.id) {
        processWrongUser(userId, ctx);
        return;
    }
    await initUsers(ctx);
    await ctx.replyWithHTML(constants.welcomeMessage)
}

const processWrongUser = (userId, ctx) => {
    const user = findUserById(userId);
    ctx.reply(`${user.name}, ты шо поц? Я разрешаю себя перезагружать только Лукасу`);
}

const initUsers = async (ctx) => {
    let allChatAdmins;
    try {
        allChatAdmins = await ctx.getChatAdministrators(ctx.message.chat)
    } catch (e) {
        allChatAdmins = [];
    }
    const usersAdmins = allChatAdmins.filter(adm => !adm.user.is_bot);
    ctx.db.users = usersAdmins.map(userAdm => {
        const user = findUserById(userAdm.user.id);
        return {...user, kekNumber: 100};
    });
}

const collectUserStats = (users) => {
    return users.map(user => {
        let userTitle;
        if (user.id === constants.users.LUX.id) {
            userTitle = `У самого ахуенного поскотовца <b>${user.name}</b>`
        } else {
            userTitle = `У дебикса <b>${user.name}</b>`
        }
        return userTitle + ` - <b>${user.kekNumber}</b> кеков`
    }).join('\n');
}

const findUserById = (userId) => {
    let user = Object.values(constants.users).find(user => user.id === userId);
    if (!user) user = constants.users.KALASH;
    return user;
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
