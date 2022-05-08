const WELCOME_MESSAGE =
    'Здарова, псы, меня зовут Мистер Кек V1.2, и теперь я здесь заправляю вашими кеками, поняли?\n\n' +
    'С этой минуты все кеки будут складываться в Кеказну, так что теперь и узнаем кто в этой вашей конфе самый смешной\n\n' +
    '- Новые фичи:\n' +
    '  1: Теперь можно ставить трипл кеки\n' +
    '  2: Ну и все больше нихуя, хули вы думаете мне за это никто не платит\n\n';
const STATS_TITLE = 'Статистика Кеказны на данный момент: \n\n';
const KEK_KEYS = ['кек', 'kek', 'топкек', 'topkek', 'k3k'];
const NE_KEK_KEYS = ['некек', 'nekek'];
const KEK_CASINO_KEYS = ['кеказино', 'кек казино', 'рандомный кек', 'kekasino', 'kek casino'];
const commands = `
/start - Запустить бота
/keys - Список слов для передачи кека
/reset - Сбросить статы
/stats - Статистика кеказны
/kekcasino - Кек казино
`;

const USERS = {
    TRUF: {name: 'Дима', id: 448341870},
    ADD: {name: 'Эд', id: 337052957},
    LUX: {name: 'Лукас', id: 372958499},
    KALASH: {name: 'Андрей', id: 261400005}
}

const MR_KEK_ID = 5362994462n;

const ANIME_KONFA_ID = -1001685837062;

module.exports.welcomeMessage = WELCOME_MESSAGE;
module.exports.statsTitle = STATS_TITLE;
module.exports.users = USERS;
module.exports.kekKeys = KEK_KEYS;
module.exports.nekekKeys = NE_KEK_KEYS;
module.exports.kekCasinoKeys = KEK_CASINO_KEYS;
module.exports.commands = commands;
module.exports.mrKekId = MR_KEK_ID;
module.exports.animeKonfaId = ANIME_KONFA_ID;
