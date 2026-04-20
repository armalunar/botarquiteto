const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const Config = require('./configManager');
const Logger = require('./logger');
const { formatDuration, parseDuration, sanitizeReason } = require('./moderationUtils');

const DATA_DIR = path.join(__dirname, '../data');
const STORE_PATH = path.join(DATA_DIR, 'moderation.json');
const LEGACY_WARNS_PATH = path.join(__dirname, '../../warns.json');

const DEFAULT_MODERATION = {
    dmUsers: true,
    warnExpiryDays: 30,
    escalation: [
        { warns: 2, action: 'timeout', duration: '30m' },
        { warns: 4, action: 'timeout', duration: '12h' },
        { warns: 6, action: 'ban' }
    ]
};

const CASE_LABELS = {
    warn: 'Advertência',
    timeout: 'Timeout',
    kick: 'Expulsão',
    ban: 'Banimento',
    unban: 'Desbanimento',
    untimeout: 'Timeout removido',
    softban: 'Softban',
    warn_removed: 'Advertência removida',
    warns_cleared: 'Advertências limpas'
};

class PunishmentSystem {
    constructor() {
        this.data = this.load();
        this.migrateLegacyWarns();
    }

    defaultData() {
        return {
            version: 2,
            nextCaseId: 1,
            meta: {
                legacyWarnsMigrated: false
            },
            guilds: {}
        };
    }

    ensureStore() {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }

    load() {
        this.ensureStore();

        try {
            if (!fs.existsSync(STORE_PATH)) {
                const initialData = this.defaultData();
                fs.writeFileSync(STORE_PATH, JSON.stringify(initialData, null, 2));
                return initialData;
            }

            const raw = fs.readFileSync(STORE_PATH, 'utf8');
            return { ...this.defaultData(), ...JSON.parse(raw) };
        } catch (error) {
            Logger.log(`Erro ao carregar banco de moderacao: ${error.message}`, 'ERROR');
            return this.defaultData();
        }
    }

    save() {
        try {
            this.ensureStore();
            fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2));
        } catch (error) {
            Logger.log(`Erro ao salvar banco de moderacao: ${error.message}`, 'ERROR');
        }
    }

    getModerationConfig() {
        const config = Config.get('moderation') || {};
        const warnExpiryDays = Number.isFinite(Number(config.warnExpiryDays))
            ? Number(config.warnExpiryDays)
            : DEFAULT_MODERATION.warnExpiryDays;

        const escalation = Array.isArray(config.escalation) && config.escalation.length > 0
            ? config.escalation
            : DEFAULT_MODERATION.escalation;

        return {
            ...DEFAULT_MODERATION,
            ...config,
            warnExpiryDays,
            escalation: escalation
                .map(rule => ({
                    warns: Number(rule.warns) || 0,
                    action: rule.action,
                    durationMs: parseDuration(rule.duration)
                }))
                .filter(rule => rule.warns > 0 && ['timeout', 'ban'].includes(rule.action))
                .sort((left, right) => left.warns - right.warns)
        };
    }

    ensureGuild(guildId) {
        if (!this.data.guilds[guildId]) {
            this.data.guilds[guildId] = {
                users: {}
            };
        }

        return this.data.guilds[guildId];
    }

    ensureUser(guildId, userId) {
        const guild = this.ensureGuild(guildId);

        if (!guild.users[userId]) {
            guild.users[userId] = {
                cases: []
            };
        }

        return guild.users[userId];
    }

    nextCaseId() {
        const caseId = `CASE-${String(this.data.nextCaseId).padStart(5, '0')}`;
        this.data.nextCaseId += 1;
        return caseId;
    }

    createCase({
        guildId,
        userId,
        type,
        moderatorId = null,
        reason,
        automatic = false,
        countsTowardWarnings = false,
        expiresAt = null,
        metadata = {}
    }) {
        const user = this.ensureUser(guildId, userId);
        const caseRecord = {
            caseId: this.nextCaseId(),
            type,
            moderatorId,
            reason: sanitizeReason(reason),
            automatic,
            countsTowardWarnings,
            createdAt: Date.now(),
            expiresAt,
            metadata
        };

        user.cases.unshift(caseRecord);
        this.save();
        return caseRecord;
    }

    listCases(guildId, userId) {
        const user = this.ensureUser(guildId, userId);
        return [...user.cases].sort((left, right) => right.createdAt - left.createdAt);
    }

    getActiveWarnings(guildId, userId) {
        const now = Date.now();

        return this.listCases(guildId, userId).filter(caseRecord => (
            caseRecord.type === 'warn' &&
            caseRecord.countsTowardWarnings &&
            !caseRecord.clearedAt &&
            (!caseRecord.expiresAt || caseRecord.expiresAt > now)
        ));
    }

    getUserProfile(guildId, userId) {
        const cases = this.listCases(guildId, userId);
        const activeWarnings = this.getActiveWarnings(guildId, userId);

        return {
            cases,
            activeWarnings,
            totalCases: cases.length,
            totalWarnings: cases.filter(caseRecord => caseRecord.type === 'warn').length
        };
    }

    migrateLegacyWarns() {
        if (this.data.meta?.legacyWarnsMigrated || !fs.existsSync(LEGACY_WARNS_PATH)) {
            return;
        }

        try {
            const raw = fs.readFileSync(LEGACY_WARNS_PATH, 'utf8');
            const legacyWarns = JSON.parse(raw);
            const guildId = Config.get('bot.guildId') || 'global';

            for (const [userId, count] of Object.entries(legacyWarns)) {
                if (!Number.isFinite(Number(count)) || Number(count) <= 0) {
                    continue;
                }

                for (let index = 0; index < Number(count); index++) {
                    this.createCase({
                        guildId,
                        userId,
                        type: 'warn',
                        moderatorId: null,
                        reason: 'Migrado do sistema antigo de advertências.',
                        automatic: false,
                        countsTowardWarnings: true,
                        expiresAt: null,
                        metadata: { legacy: true }
                    });
                }
            }

            this.data.meta.legacyWarnsMigrated = true;
            this.save();
        } catch (error) {
            Logger.log(`Falha ao migrar warns antigos: ${error.message}`, 'ERROR');
        }
    }

    async sendUserNotice(targetUser, guild, caseRecord) {
        const config = this.getModerationConfig();
        if (!config.dmUsers || !targetUser) {
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Notificação de moderação: ${CASE_LABELS[caseRecord.type] || caseRecord.type}`)
            .setColor(this.getCaseColor(caseRecord.type))
            .setDescription(`Servidor: **${guild.name}**`)
            .addFields(
                { name: 'Registro', value: caseRecord.caseId, inline: true },
                { name: 'Motivo', value: caseRecord.reason, inline: true }
            )
            .setTimestamp(new Date(caseRecord.createdAt));

        if (caseRecord.expiresAt) {
            embed.addFields({
                name: 'Expira em',
                value: `<t:${Math.floor(caseRecord.expiresAt / 1000)}:R>`,
                inline: true
            });
        }

        await targetUser.send({ embeds: [embed] }).catch(() => {});
    }

    getCaseColor(type) {
        if (type === 'warn') return '#F1C40F';
        if (type === 'timeout' || type === 'softban') return '#E67E22';
        if (type === 'ban') return '#E74C3C';
        if (type === 'kick') return '#D35400';
        return '#5865F2';
    }

    async logCase(guild, userId, caseRecord) {
        const channelId = Config.get('channels.modLogs') || Config.get('channels.securityLogs');
        if (!channelId) {
            return;
        }

        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            return;
        }

        const activeWarnings = this.getActiveWarnings(guild.id, userId).length;
        const typeLabel = CASE_LABELS[caseRecord.type] || caseRecord.type;

        const embed = new EmbedBuilder()
            .setTitle(`Registro de moderação: ${typeLabel}`)
            .setColor(this.getCaseColor(caseRecord.type))
            .addFields(
                { name: 'Registro', value: caseRecord.caseId, inline: true },
                { name: 'Usuário', value: `<@${userId}>`, inline: true },
                {
                    name: 'Origem',
                    value: caseRecord.automatic ? 'Automática' : 'Manual',
                    inline: true
                },
                {
                    name: 'Moderador',
                    value: caseRecord.moderatorId ? `<@${caseRecord.moderatorId}>` : 'Sistema',
                    inline: true
                },
                {
                    name: 'Advertências ativas',
                    value: String(activeWarnings),
                    inline: true
                },
                {
                    name: 'Registrado em',
                    value: `<t:${Math.floor(caseRecord.createdAt / 1000)}:F>`,
                    inline: true
                },
                {
                    name: 'Motivo',
                    value: caseRecord.reason,
                    inline: false
                }
            )
            .setTimestamp(new Date(caseRecord.createdAt));

        if (caseRecord.expiresAt) {
            embed.addFields({
                name: 'Expiração',
                value: `<t:${Math.floor(caseRecord.expiresAt / 1000)}:R>`,
                inline: true
            });
        }

        if (caseRecord.metadata?.triggerMessage) {
            embed.addFields({
                name: 'Conteúdo analisado',
                value: String(caseRecord.metadata.triggerMessage).slice(0, 1024),
                inline: false
            });
        }

        await channel.send({ embeds: [embed] }).catch(() => {});
    }

    async warnMember({ guild, member, moderator, reason, automatic = false, metadata = {} }) {
        const config = this.getModerationConfig();
        const expiresAt = config.warnExpiryDays > 0
            ? Date.now() + (config.warnExpiryDays * 24 * 60 * 60 * 1000)
            : null;

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: member.id,
            type: 'warn',
            moderatorId: moderator?.id || null,
            reason,
            automatic,
            countsTowardWarnings: true,
            expiresAt,
            metadata
        });

        await this.logCase(guild, member.id, caseRecord);
        await this.sendUserNotice(member.user, guild, caseRecord);

        const escalation = await this.applyEscalationIfNeeded({
            guild,
            member,
            moderator,
            baseReason: reason,
            triggerCase: caseRecord
        });

        return {
            caseRecord,
            activeWarnings: this.getActiveWarnings(guild.id, member.id).length,
            escalation
        };
    }

    async timeoutMember({
        guild,
        member,
        moderator,
        reason,
        durationMs,
        automatic = false,
        metadata = {}
    }) {
        await member.timeout(durationMs, sanitizeReason(reason));

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: member.id,
            type: 'timeout',
            moderatorId: moderator?.id || null,
            reason,
            automatic,
            countsTowardWarnings: false,
            expiresAt: Date.now() + durationMs,
            metadata
        });

        await this.logCase(guild, member.id, caseRecord);
        await this.sendUserNotice(member.user, guild, caseRecord);

        return caseRecord;
    }

    async kickMember({ guild, member, moderator, reason, automatic = false, metadata = {} }) {
        await member.kick(sanitizeReason(reason));

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: member.id,
            type: 'kick',
            moderatorId: moderator?.id || null,
            reason,
            automatic,
            countsTowardWarnings: false,
            metadata
        });

        await this.logCase(guild, member.id, caseRecord);
        await this.sendUserNotice(member.user, guild, caseRecord);

        return caseRecord;
    }

    async banUser({
        guild,
        user,
        moderator,
        reason,
        deleteMessageSeconds = 0,
        automatic = false,
        metadata = {}
    }) {
        await guild.members.ban(user, {
            deleteMessageSeconds,
            reason: sanitizeReason(reason)
        });

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: user.id,
            type: 'ban',
            moderatorId: moderator?.id || null,
            reason,
            automatic,
            countsTowardWarnings: false,
            metadata
        });

        await this.logCase(guild, user.id, caseRecord);
        await this.sendUserNotice(user, guild, caseRecord);

        return caseRecord;
    }

    async softBanMember({
        guild,
        member,
        moderator,
        reason,
        deleteMessageSeconds = 24 * 60 * 60
    }) {
        await guild.members.ban(member.user, {
            deleteMessageSeconds,
            reason: sanitizeReason(reason)
        });
        await guild.members.unban(member.id, 'Softban concluido');

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: member.id,
            type: 'softban',
            moderatorId: moderator?.id || null,
            reason,
            automatic: false,
            countsTowardWarnings: false,
            metadata: {
                deleteMessageSeconds
            }
        });

        await this.logCase(guild, member.id, caseRecord);
        return caseRecord;
    }

    async unbanUser({ guild, userId, moderator, reason }) {
        await guild.members.unban(userId, sanitizeReason(reason));

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId,
            type: 'unban',
            moderatorId: moderator?.id || null,
            reason,
            automatic: false,
            countsTowardWarnings: false
        });

        await this.logCase(guild, userId, caseRecord);
        return caseRecord;
    }

    async removeTimeout({ guild, member, moderator, reason }) {
        await member.timeout(null, sanitizeReason(reason));

        const caseRecord = this.createCase({
            guildId: guild.id,
            userId: member.id,
            type: 'untimeout',
            moderatorId: moderator?.id || null,
            reason,
            automatic: false,
            countsTowardWarnings: false
        });

        await this.logCase(guild, member.id, caseRecord);
        await this.sendUserNotice(member.user, guild, caseRecord);
        return caseRecord;
    }

    removeWarning({ guildId, userId, caseId, moderatorId, reason }) {
        const user = this.ensureUser(guildId, userId);
        const targetCase = user.cases.find(caseRecord => (
            caseRecord.caseId === caseId &&
            caseRecord.type === 'warn' &&
            !caseRecord.clearedAt
        ));

        if (!targetCase) {
            return null;
        }

        targetCase.clearedAt = Date.now();
        targetCase.clearedBy = moderatorId || null;
        targetCase.clearReason = sanitizeReason(reason, 'Advertência removida pela equipe de moderação.');

        const caseRecord = this.createCase({
            guildId,
            userId,
            type: 'warn_removed',
            moderatorId,
            reason: `Remoção do registro ${caseId}: ${sanitizeReason(reason, 'Sem motivo informado')}`,
            automatic: false,
            countsTowardWarnings: false,
            metadata: { removedCaseId: caseId }
        });

        this.save();
        return { removed: targetCase, audit: caseRecord };
    }

    clearWarnings({ guildId, userId, moderatorId, reason }) {
        const activeWarnings = this.getActiveWarnings(guildId, userId);
        if (activeWarnings.length === 0) {
            return null;
        }

        for (const warning of activeWarnings) {
            warning.clearedAt = Date.now();
            warning.clearedBy = moderatorId || null;
            warning.clearReason = sanitizeReason(reason, 'Advertências limpas pela equipe de moderação.');
        }

        const caseRecord = this.createCase({
            guildId,
            userId,
            type: 'warns_cleared',
            moderatorId,
            reason: sanitizeReason(reason, 'Todas as advertências ativas foram limpas.'),
            automatic: false,
            countsTowardWarnings: false,
            metadata: { clearedCases: activeWarnings.map(warning => warning.caseId) }
        });

        this.save();
        return { clearedCount: activeWarnings.length, audit: caseRecord };
    }

    async applyEscalationIfNeeded({ guild, member, moderator, baseReason, triggerCase }) {
        const activeWarnings = this.getActiveWarnings(guild.id, member.id).length;
        const rules = this.getModerationConfig().escalation;
        const rule = rules.find(currentRule => activeWarnings === currentRule.warns);

        if (!rule) {
            return null;
        }

        if (rule.action === 'timeout') {
            if (!member.moderatable || !rule.durationMs) {
                return {
                    action: 'timeout',
                    skipped: true,
                    reason: 'Timeout automático não pode ser aplicado neste membro.'
                };
            }

            const timeoutCase = await this.timeoutMember({
                guild,
                member,
                moderator,
                reason: `Escalonamento automático: ${sanitizeReason(baseReason)}`,
                durationMs: rule.durationMs,
                automatic: true,
                metadata: {
                    escalatedFrom: triggerCase.caseId,
                    activeWarnings
                }
            });

            return {
                action: 'timeout',
                caseRecord: timeoutCase,
                durationMs: rule.durationMs
            };
        }

        if (rule.action === 'ban') {
            if (!member.bannable) {
                return {
                    action: 'ban',
                    skipped: true,
                    reason: 'Banimento automático não pode ser aplicado neste membro.'
                };
            }

            const banCase = await this.banUser({
                guild,
                user: member.user,
                moderator,
                reason: `Escalonamento automático: ${sanitizeReason(baseReason)}`,
                deleteMessageSeconds: 0,
                automatic: true,
                metadata: {
                    escalatedFrom: triggerCase.caseId,
                    activeWarnings
                }
            });

            return {
                action: 'ban',
                caseRecord: banCase
            };
        }

        return null;
    }
}

module.exports = new PunishmentSystem();
