const { PermissionFlagsBits } = require('discord.js');

const Config = require('./configManager');
const PunishmentSystem = require('./punishmentSystem');
const AntiRaidSystem = require('./antiRaidSystem');
const { escapeRegExp, normalizeContent } = require('./moderationUtils');
const { normalizeRoleIds, memberHasAnyRole } = require('./permissionUtils');

const floodState = new Map();
const duplicateState = new Map();
const noticeCooldowns = new Map();

const MANDATORY_BAD_WORDS = ['estupro'];

const DEFAULT_AUTOMOD = {
    antiLink: false,
    antiSpam: true,
    antiFlood: false,
    capsLock: false,
    mentionSpam: false,
    mentionLimit: 5,
    badWords: [],
    duplicateCount: 3,
    duplicateWindowMs: 30 * 1000,
    floodCount: 5,
    floodWindowMs: 7 * 1000,
    capsMinLetters: 10,
    maxCapsPercent: 70,
    warningNoticeCooldownMs: 12 * 1000
};

function getAutoModConfig() {
    const config = Config.get('automod') || {};
    const configuredBadWords = Array.isArray(config.badWords) ? config.badWords : DEFAULT_AUTOMOD.badWords;
    const normalizedConfigured = configuredBadWords
        .map(word => String(word || '').trim().toLowerCase())
        .filter(Boolean);

    return {
        ...DEFAULT_AUTOMOD,
        ...config,
        badWords: Array.from(new Set([...MANDATORY_BAD_WORDS, ...normalizedConfigured]))
    };
}

function memberIsExempt(message) {
    if (!message.member) {
        return true;
    }

    if (message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
    return memberHasAnyRole(message.member, staffRoleIds);
}

function buildViolation(type, reason, notice, punish = true) {
    return {
        type,
        reason,
        notice,
        punish,
        deleteMessage: true
    };
}

function detectLink(message, config, isTrusted) {
    if (!config.antiLink || isTrusted) {
        return null;
    }

    const linkRegex = /(https?:\/\/[^\s]+)|(discord\.gg\/[^\s]+)|(discord(app)?\.com\/invite\/[^\s]+)/i;
    if (!linkRegex.test(message.content)) {
        return null;
    }

    return buildViolation(
        'link',
        'Envio de link não autorizado.',
        `${message.author}, links não são permitidos neste servidor.`
    );
}

function detectBadWord(message, config) {
    if (!config.badWords.length || !message.content) {
        return null;
    }

    const foundWord = config.badWords.find(word => {
        const regex = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`, 'i');
        return regex.test(message.content.toLowerCase());
    });

    if (!foundWord) {
        return null;
    }

    return buildViolation(
        'badword',
        `Uso de linguagem proibida: ${foundWord}.`,
        `${message.author}, essa linguagem não é permitida neste servidor.`
    );
}

function detectDuplicateSpam(message, config) {
    if (!config.antiSpam || !message.content) {
        return null;
    }

    const now = Date.now();
    const normalized = normalizeContent(message.content);
    const current = duplicateState.get(message.author.id) || {
        content: '',
        count: 0,
        lastSeenAt: 0
    };

    if (normalized && current.content === normalized && now - current.lastSeenAt <= config.duplicateWindowMs) {
        current.count += 1;
    } else {
        current.content = normalized;
        current.count = 1;
    }

    current.lastSeenAt = now;
    duplicateState.set(message.author.id, current);

    if (current.count < config.duplicateCount) {
        return null;
    }

    current.count = 0;
    duplicateState.set(message.author.id, current);

    return buildViolation(
        'duplicate_spam',
        'Spam por repetição de mensagem.',
        `${message.author}, evite repetir a mesma mensagem várias vezes.`
    );
}

function detectFlood(message, config) {
    if (!config.antiFlood) {
        return null;
    }

    const now = Date.now();
    const timestamps = floodState.get(message.author.id) || [];
    const nextTimestamps = timestamps
        .filter(timestamp => now - timestamp <= config.floodWindowMs)
        .concat(now);

    floodState.set(message.author.id, nextTimestamps);

    if (nextTimestamps.length < config.floodCount) {
        return null;
    }

    floodState.set(message.author.id, []);

    return buildViolation(
        'flood',
        'Flood detectado por excesso de mensagens em curto intervalo.',
        `${message.author}, você está enviando mensagens rápido demais.`
    );
}

function detectCaps(message, config) {
    if (!config.capsLock || !message.content) {
        return null;
    }

    const lettersOnly = message.content.replace(/[^a-zA-Z]/g, '');
    if (lettersOnly.length < config.capsMinLetters) {
        return null;
    }

    const upperCaseCount = (lettersOnly.match(/[A-Z]/g) || []).length;
    const capsPercent = (upperCaseCount / lettersOnly.length) * 100;

    if (capsPercent < config.maxCapsPercent) {
        return null;
    }

    return {
        ...buildViolation(
            'caps',
            'Excesso de letras maiúsculas.',
            `${message.author}, evite gritar em caps lock.`,
            false
        )
    };
}

function detectMentionSpam(message, config) {
    if (!config.mentionSpam) {
        return null;
    }

    const totalMentions = message.mentions.users.size + message.mentions.roles.size;
    if (totalMentions <= config.mentionLimit) {
        return null;
    }

    return buildViolation(
        'mention_spam',
        `Excesso de menções em uma única mensagem (${totalMentions}).`,
        `${message.author}, você mencionou usuários ou cargos demais de uma vez.`
    );
}

async function sendTemporaryNotice(message, violation, config) {
    const cooldownKey = `${message.channelId}:${message.author.id}:${violation.type}`;
    const lastNoticeAt = noticeCooldowns.get(cooldownKey) || 0;
    const now = Date.now();

    if (now - lastNoticeAt < config.warningNoticeCooldownMs) {
        return;
    }

    noticeCooldowns.set(cooldownKey, now);

    const sentMessage = await message.channel.send({ content: violation.notice }).catch(() => null);
    if (!sentMessage) {
        return;
    }

    setTimeout(() => {
        sentMessage.delete().catch(() => {});
    }, 5000);
}

async function applyViolation(client, message, violation, config) {
    if (violation.deleteMessage) {
        await message.delete().catch(() => {});
    }

    await sendTemporaryNotice(message, violation, config);

    if (!violation.punish || !message.member) {
        return { punished: false };
    }

    const result = await PunishmentSystem.warnMember({
        guild: message.guild,
        member: message.member,
        moderator: client.user,
        reason: violation.reason,
        automatic: true,
        metadata: {
            violationType: violation.type,
            channelId: message.channelId,
            messageId: message.id,
            triggerMessage: message.content
        }
    });

    return {
        punished: true,
        ...result
    };
}

async function handleMessage(client, message) {
    if (!message.guild || !message.member || message.author.bot || memberIsExempt(message)) {
        return null;
    }

    const config = getAutoModConfig();
    const trustedRoleId = Config.get('roles.trusted');
    const isTrusted = Boolean(trustedRoleId && message.member.roles.cache.has(trustedRoleId));

    const checks = [
        () => AntiRaidSystem.detectRaidGateViolation(message),
        () => detectMentionSpam(message, config),
        () => detectBadWord(message, config),
        () => detectLink(message, config, isTrusted),
        () => detectDuplicateSpam(message, config),
        () => detectFlood(message, config),
        () => detectCaps(message, config)
    ];

    for (const check of checks) {
        const violation = check();
        if (!violation) {
            continue;
        }

        return applyViolation(client, message, violation, config);
    }

    return null;
}

module.exports = {
    handleMessage
};
