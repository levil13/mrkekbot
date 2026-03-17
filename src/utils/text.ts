export function normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s/g, '');
}

export function isSpecificMessage(message: string, keys: readonly string[]): boolean {
    if (!message) return false;
    return keys.includes(normalizeText(message));
}
