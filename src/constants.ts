export const KEK_KEYS = ['кек', 'kek', 'топкек', 'topkek', 'k3k'] as const;
export const NEKEK_KEYS = ['некек', 'nekek'] as const;
export const KEK_CASINO_KEYS = ['кеказино', 'кек казино', 'рандомный кек', 'kekasino', 'kek casino'] as const;

export const ANIME_KONFA_ID = process.env.ANIME_KONFA_ID;
export const MR_KEK_ID = process.env.MR_KEK_ID;

export interface UserConfig {
    name: string;
    id: number;
}

export const USERS: Record<string, UserConfig> = {
    TRUF: { name: 'Дима', id: 448341870 },
    ADD:  { name: 'Эд', id: 337052957 },
    LUX:  { name: 'Лукас', id: 372958499 },
    KALASH: { name: 'Андрей', id: 261400005 },
};

export const WELCOME_MESSAGE =
    'Здарова, псы, меня зовут Мистер Кек V2.0, и теперь я здесь заправляю вашими кеками, поняли?\n\n' +
    'С этой минуты все кеки будут складываться в Кеказну, так что теперь и узнаем кто в этой вашей конфе самый смешной\n\n';

export const STATS_TITLE = 'Статистика Кеказны на данный момент: \n\n';

export const COMMANDS_TEXT = `
/start - Запустить бота
/keys - Список слов для передачи кека
/reset - Сбросить статы
/stats - Статистика кеказны
/kekcasino - Кек казино
`;

export const DAY_IN_MILLIS = 86_400_000;
export const INITIAL_KEK_COUNT = 100;
