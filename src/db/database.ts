import { join } from 'path';
import { JSONFile, Low } from 'lowdb';
import { Database, User } from './models';
import { USERS, INITIAL_KEK_COUNT, DAY_IN_MILLIS } from '../constants';
import { findUserById } from '../utils/users';
import { TelegramClient, Api } from 'telegram';

let db: Low<Database>;

export async function initDatabase(): Promise<void> {
    db = new Low<Database>(new JSONFile(join(__dirname, '../../db.json')));
    await db.read();
    if (!db.data) {
        await resetDatabase(undefined);
    }
}

export function getDb(): Low<Database> {
    return db;
}

export async function resetDatabase(client: TelegramClient | undefined): Promise<void> {
    if (client) {
        const users = await fetchUsersFromChannel(client);
        db.data = { users, messagesWithKek: [], bannedMedia: db.data?.bannedMedia ?? [] };
    } else {
        const userList = Object.values(USERS).map(u => ({
            ...u,
            kekNumber: INITIAL_KEK_COUNT,
            lastKekGivenTo: null,
        }));
        db.data = { users: userList, messagesWithKek: [], bannedMedia: [] };
    }
    await db.write();
}

export async function fetchUsersFromChannel(client: TelegramClient): Promise<User[]> {
    const result = await client.invoke(new Api.channels.GetParticipants({
        channel: -1001685837062 as any,
        filter: new Api.ChannelParticipantsRecent(),
        limit: 100,
        offset: 0,
        hash: 0 as any,
    })) as Api.channels.ChannelParticipants;

    return result.users
        .filter((u): u is Api.User => u instanceof Api.User && !u.bot)
        .map(u => {
            const config = findUserById(Number(u.id));
            return {
                id: Number(u.id),
                name: config?.name ?? (u as any).firstName ?? 'Unknown',
                kekNumber: INITIAL_KEK_COUNT,
                lastKekGivenTo: null,
            };
        });
}

export function clearOldMessagesWithKek(): void {
    if (!db.data?.messagesWithKek?.length) return;
    const now = Date.now();
    db.data.messagesWithKek = db.data.messagesWithKek.filter(
        msg => DAY_IN_MILLIS > now - msg.date * 1000
    );
}
