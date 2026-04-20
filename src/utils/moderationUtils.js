const { EmbedBuilder } = require('discord.js');

const DURATION_UNITS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
};

function sanitizeReason(reason, fallback = 'Sem motivo informado') {
    if (!reason || typeof reason !== 'string') {
        return fallback;
    }

    const trimmed = reason.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function parseDuration(input) {
    if (input === null || input === undefined) {
        return null;
    }

    const raw = String(input).trim().toLowerCase();
    if (!raw) {
        return null;
    }

    if (/^\d+$/.test(raw)) {
        return Number(raw) * DURATION_UNITS.m;
    }

    const normalized = raw.replace(/\s+/g, '');
    const regex = /(\d+)([smhdw])/g;
    let total = 0;
    let matched = '';
    let current = regex.exec(normalized);

    while (current) {
        total += Number(current[1]) * DURATION_UNITS[current[2]];
        matched += current[0];
        current = regex.exec(normalized);
    }

    if (!total || matched !== normalized) {
        return null;
    }

    return total;
}

function formatDuration(durationMs) {
    if (!durationMs || durationMs <= 0) {
        return 'permanente';
    }

    const units = [
        ['semana', DURATION_UNITS.w],
        ['dia', DURATION_UNITS.d],
        ['hora', DURATION_UNITS.h],
        ['minuto', DURATION_UNITS.m],
        ['segundo', DURATION_UNITS.s]
    ];

    let remaining = durationMs;
    const parts = [];

    for (const [label, value] of units) {
        if (remaining < value) {
            continue;
        }

        const count = Math.floor(remaining / value);
        remaining -= count * value;
        parts.push(`${count} ${label}${count > 1 ? 's' : ''}`);

        if (parts.length === 2) {
            break;
        }
    }

    return parts.join(' e ');
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeContent(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function validateModerationTarget(interaction, targetMember) {
    if (!targetMember) {
        return 'Usuário não encontrado no servidor.';
    }

    if (targetMember.id === interaction.user.id) {
        return 'Você não pode aplicar esta ação em si mesmo.';
    }

    if (targetMember.id === interaction.client.user.id) {
        return 'Você não pode aplicar esta ação no próprio bot.';
    }

    if (targetMember.id === interaction.guild.ownerId) {
        return 'Não é possível moderar o dono do servidor.';
    }

    const moderator = interaction.member;
    const botMember = interaction.guild.members.me;

    if (
        moderator.id !== interaction.guild.ownerId &&
        moderator.roles?.highest &&
        targetMember.roles?.highest &&
        moderator.roles.highest.position <= targetMember.roles.highest.position
    ) {
        return 'Sua hierarquia é igual ou inferior à do alvo.';
    }

    if (
        botMember?.roles?.highest &&
        targetMember.roles?.highest &&
        botMember.roles.highest.position <= targetMember.roles.highest.position
    ) {
        return 'Minha hierarquia é insuficiente para executar esta ação.';
    }

    return null;
}

function buildModerationEmbed({
    title,
    color,
    description,
    target,
    moderator,
    reason,
    caseRecord,
    extraFields = []
}) {
    const targetUser = target?.user || target;
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(description || null)
        .addFields(
            {
                name: 'Jogador',
                value: targetUser ? `${targetUser.tag} (${targetUser.id})` : 'Desconhecido',
                inline: false
            },
            {
                name: 'Comissão Técnica',
                value: moderator ? `<@${moderator.id}>` : 'Sistema',
                inline: true
            },
            {
                name: 'Motivo',
                value: sanitizeReason(reason),
                inline: true
            }
        )
        .setTimestamp();

    if (caseRecord?.caseId) {
        embed.addFields({
            name: 'Registro',
            value: caseRecord.caseId,
            inline: true
        });
    }

    if (targetUser?.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL());
    }

    if (extraFields.length > 0) {
        embed.addFields(extraFields);
    }

    return embed;
}

module.exports = {
    buildModerationEmbed,
    escapeRegExp,
    formatDuration,
    normalizeContent,
    parseDuration,
    sanitizeReason,
    validateModerationTarget
};
