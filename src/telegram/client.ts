import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
    // Если SESSION_KEY задан — просто подключаемся без интерактивного ввода
    if (process.env.SESSION_KEY) {
        await client.connect();
        const isAuthorized = await client.isUserAuthorized();
        if (!isAuthorized) {
            throw new Error('SESSION_KEY невалидный или истёк, авторизуйся заново');
        }
        console.log('✅ Telegram client авторизован');
        return;
    }

    // Интерактивная авторизация — только если SESSION_KEY не задан
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

    await client.start({
        phoneNumber: async () => await ask('Phone: '),
        phoneCode: async () => await ask('Code from Telegram: '),
        password: async () => await ask('2FA password (если есть): '),
        onError: (err) => console.log(err),
    });

    rl.close();

    const session = client.session.save() as unknown as string;
    await saveSession(session);
    console.log('✅ Авторизован, SESSION_KEY сохранён в .env');
}

async function saveSession(session: string): Promise<void> {
    const envPath = path.join(__dirname, '../../.env');
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    if (env.includes('SESSION_KEY=')) {
        env = env.replace(/^SESSION_KEY=.*/m, `SESSION_KEY=${session}`);
    } else {
        env += `\nSESSION_KEY=${session}`;
    }

    fs.writeFileSync(envPath, env);
}
