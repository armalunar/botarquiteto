const { EmbedBuilder } = require('discord.js');

const Config = require('./configManager');
const Logger = require('./logger');
const { normalizeRoleIds, isStaffMember } = require('./permissionUtils');

const guildState = new Map();

function clampNumber(value, { min, max, fallback }) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (typeof min === 'number' && parsed < min) return min;
    if (typeof max === 'number' && parsed > max) return max;
    return parsed;
}

function getAntiRaidConfig() {
    const moderation = Config.get('moderation') || {};
    const antiRaid = moderation.antiRaid || {};

    const joinThresholdFallback = clampNumber(moderation.raidJoinThreshold, { min: 2, max: 100, fallback: 5 });
    const joinWindowFallback = clampNumber(moderation.raidJoinWindowMs, { min: 5_000, max: 10 * 60_000, fallback: 60_000 });

    return {
        enabled: Boolean(antiRaid.enabled),
        joinThreshold: clampNumber(antiRaid.joinThreshold, { min: 2, max: 100, fallback: joinThresholdFallback }),
        joinWindowMs: clampNumber(antiRaid.joinWindowMs, { min: 5_000, max: 10 * 60_000, fallback: joinWindowFallback }),
        alertCooldownMs: clampNumber(antiRaid.alertCooldownMs, { min: 10_000, max: 60 * 60_000, fallback: 3 * 60_000 }),
        raidModeDurationMs: clampNumber(antiRaid.raidModeDurationMs, { min: 60_000, max: 24 * 60 * 60_000, fallback: 10 * 60_000 }),
        blockUnverifiedMessages: antiRaid.blockUnverifiedMessages !== false,
        quarantineRoleId: String(antiRaid.quarantineRoleId || '').trim(),
        dmOnRaidJoin: Boolean(antiRaid.dmOnRaidJoin)
    };
}

function ensureGuildState(guildId) {
    const existing = guildState.get(guildId);
    if (existing) return existing;

    const created = {
        joinTimestamps: [],
        raidUntil: 0,
        lastAlertAt: 0,
        lastTriggeredAt: 0,
        lastJoinCount: 0
    };

    guildState.set(guildId, created);
    return created;
}

async function getSecurityChannel(guild) {
    const channelId = Config.get('channels.securityLogs') || Config.get('channels.modLogs');
    if (!channelId) {
        return null;
    }

    return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function sendSecurityEmbed(guild, embed) {
    const channel = await getSecurityChannel(guild);
    if (!channel) return;
    await channel.send({ embeds: [embed] }).catch(() => {});
}

function isRaidModeActive(guildId) {
    const state = guildState.get(guildId);
    if (!state) return false;
    return Date.now() < (state.raidUntil || 0);
}

function getRaidStatus(guildId) {
    const state = guildState.get(guildId) || {};
    const raidUntil = Number(state.raidUntil) || 0;
    const active = Date.now() < raidUntil;
    return {
        active,
        raidUntil,
        lastTriggeredAt: Number(state.lastTriggeredAt) || 0,
        lastJoinCount: Number(state.lastJoinCount) || 0
    };
}

async function triggerRaidMode(guild, state, config, { joinCount }) {
    const now = Date.now();
    state.lastAlertAt = now;
    state.lastTriggeredAt = now;
    state.raidUntil = Math.max(state.raidUntil || 0, now + config.raidModeDurationMs);

    const endsAt = Math.floor(state.raidUntil / 1000);
    const windowSeconds = Math.max(1, Math.floor(config.joinWindowMs / 1000));

    const quarantineRoleId = config.quarantineRoleId;
    const gateEnabled = config.blockUnverifiedMessages;

    const embed = new EmbedBuilder()
        .setTitle('🚨 Anti-Raid • Atividade anormal detectada')
        .setColor('#ED4245')
        .setDescription(
            [
                '```fix',
                'RAID MODE: ATIVO',
                `ENTRADAS: ${joinCount}/${config.joinThreshold} em ${windowSeconds}s`,
                '```',
                gateEnabled
                    ? '🛡️ Gate ativo: mensagens de não-verificados serão bloqueadas temporariamente.'
                    : '⚠️ Gate desativado: apenas alerta (sem bloqueio).',
                quarantineRoleId ? `🧪 Quarentena: <@&${quarantineRoleId}> (novos membros durante o raid).` : '🧪 Quarentena: não configurada.',
                '',
                `⏳ Expira: <t:${endsAt}:R>`
            ].join('\n')
        )
        .setTimestamp();

    await sendSecurityEmbed(guild, embed);
}

async function applyQuarantineRole(member, quarantineRoleId) {
    if (!quarantineRoleId) {
        return;
    }

    if (!member?.roles?.add) {
        return;
    }

    if (member.roles.cache?.has?.(quarantineRoleId)) {
        return;
    }

    const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
    if (isStaffMember(member, { staffRoleIds })) {
        return;
    }

    try {
        await member.roles.add(quarantineRoleId, 'Anti-Raid: quarentena automática.');
    } catch (error) {
        Logger.log(`Anti-Raid: falha ao aplicar quarentena (${member.id}): ${error.message}`, 'WARN');
    }
}

async function handleMemberJoin(client, member) {
    const guild = member.guild;
    const config = getAntiRaidConfig();
    const guildId = guild.id;
    const state = ensureGuildState(guildId);

    if (!config.enabled) {
        return { triggered: false, raidActive: isRaidModeActive(guildId) };
    }

    const now = Date.now();
    const cutoff = now - config.joinWindowMs;
    state.joinTimestamps = (state.joinTimestamps || []).filter(ts => ts >= cutoff);
    state.joinTimestamps.push(now);
    state.lastJoinCount = state.joinTimestamps.length;

    const joinCount = state.joinTimestamps.length;
    const shouldTrigger = joinCount >= config.joinThreshold && (now - (state.lastAlertAt || 0) >= config.alertCooldownMs);

    if (shouldTrigger) {
        await triggerRaidMode(guild, state, config, { joinCount });
    }

    const raidActive = isRaidModeActive(guildId);

    if (raidActive) {
        await applyQuarantineRole(member, config.quarantineRoleId);

        if (config.dmOnRaidJoin) {
            await member.user.send(
                [
                    '🛡️ **Modo Anti-Raid ativo**',
                    'Detectamos uma alta de entradas e, temporariamente, algumas ações podem ficar restritas.',
                    'Se você ainda não concluiu a verificação, finalize para liberar o acesso.',
                    '',
                    'Se sua DM estiver fechada, ative mensagens diretas de membros do servidor e tente novamente.'
                ].join('\n')
            ).catch(() => {});
        }
    }

    return { triggered: shouldTrigger, raidActive };
}

function detectRaidGateViolation(message) {
    if (!message?.guild || !message.member) {
        return null;
    }

    const config = getAntiRaidConfig();
    if (!config.enabled || !config.blockUnverifiedMessages) {
        return null;
    }

    if (!isRaidModeActive(message.guild.id)) {
        return null;
    }

    const verifiedRoleId = Config.get('roles.verified');
    if (!verifiedRoleId) {
        return null;
    }

    if (message.member.roles?.cache?.has?.(verifiedRoleId)) {
        return null;
    }

    const trustedRoleId = Config.get('roles.trusted');
    if (trustedRoleId && message.member.roles?.cache?.has?.(trustedRoleId)) {
        return null;
    }

    return {
        type: 'anti_raid_gate',
        reason: 'Anti-Raid: mensagem bloqueada (usuário não verificado).',
        notice: `${message.author}, o servidor está em **modo Anti-Raid**. Conclua a verificação para enviar mensagens.`,
        punish: false,
        deleteMessage: true
    };
}

module.exports = {
    getAntiRaidConfig,
    getRaidStatus,
    isRaidModeActive,
    handleMemberJoin,
    detectRaidGateViolation
};

