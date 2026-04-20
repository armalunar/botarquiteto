function stripDiacritics(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function slugifyKey(text, maxLength = 32) {
    const cleaned = stripDiacritics(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return cleaned.slice(0, maxLength) || 'jogo';
}

function createUniqueGameKey(label, existingKeys) {
    const base = slugifyKey(label);
    const keys = new Set(Array.isArray(existingKeys) ? existingKeys : []);
    if (!keys.has(base)) return base;

    for (let index = 2; index <= 99; index++) {
        const candidate = `${base}_${index}`;
        if (!keys.has(candidate)) return candidate;
    }

    return `${base}_${Date.now()}`;
}

function parseEmojiInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    const match = raw.match(/^<(?:(a):)?([a-zA-Z0-9_]{1,32}):(\d{17,20})>$/);
    if (match) {
        return {
            animated: Boolean(match[1]),
            name: match[2],
            id: match[3]
        };
    }

    return raw;
}

function normalizeGameRoles(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map(entry => ({
            key: String(entry?.key || '').trim(),
            label: String(entry?.label || '').trim(),
            roleId: String(entry?.roleId || '').trim(),
            emoji: entry?.emoji ?? null
        }))
        .filter(entry => entry.key && entry.label);
}

module.exports = {
    createUniqueGameKey,
    parseEmojiInput,
    normalizeGameRoles
};

