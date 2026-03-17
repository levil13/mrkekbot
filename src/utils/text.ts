export function normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s/g, '');
}

export function isSpecificMessage(
    message: { message?: string; text?: string },
    keys: readonly string[]
): boolean {
    const text = message.message || message.text;
    if (!text) return false;
    return keys.includes(normalizeText(text));
}
