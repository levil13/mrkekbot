import { USERS, UserConfig } from '../constants';
import { User } from '../db/models';

export function findUserById(userId: number | bigint): UserConfig | undefined {
    return Object.values(USERS).find(user => user.id == userId);
}

export function collectUserStats(users: User[]): string {
    return [...users]
        .sort((a, b) => b.kekNumber - a.kekNumber)
        .map(user => getUserTitle(user) + ` - <b>${user.kekNumber}</b> кеков`)
        .join('\n');
}

function getUserTitle(user: User): string {
    if (user.id === USERS.LUX.id) {
        return `У самого ахуенного поскотовца <b>${user.name}</b>`;
    }
    return `У дебикса <b>${user.name}</b>`;
}
