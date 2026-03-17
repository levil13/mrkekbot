import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

let client: TelegramClient;

export function createTelegramClient(): TelegramClient {
    const session = new StringSession(process.env.SESSION_KEY ?? '');
    client = new TelegramClient(
        session,
        Number(process.env.API_ID),
        process.env.API_HASH ?? '',
        { connectionRetries: 5 }
    );
    return client;
}

export function getTelegramClient(): TelegramClient {
    return client;
}

export async function initTelegramClient(): Promise<void> {
    await client.connect();
}
