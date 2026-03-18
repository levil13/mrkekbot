import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import path from 'node:path';

let client: TelegramClient;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (q: string) =>
    new Promise<string>((resolve) => rl.question(q, resolve));

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
    await client.start({
        phoneNumber: async () => await ask('Phone: '),
        phoneCode: async () => await ask('Code from Telegram: '),
        password: async () => await ask('2FA password (если есть): '),
        onError: (err) => console.log(err),
    });

    const session = client.session.save() as unknown as string
    if (session !== process.env.SESSION_KEY) {
        await saveSession(session)
    }

    await client.connect();
}

async function saveSession(session: string): Promise<void> {
    let env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf-8');

    if (env.includes('SESSION_KEY=')) {
        env = env.replace(/^SESSION_KEY=.*/m, `SESSION_KEY=${ session }`);
    } else {
        // если нет — добавить
        env += `\nSESSION_KEY=${ session }`;
    }

    fs.writeFileSync(path.join(__dirname, '../../.env'), env);
}
