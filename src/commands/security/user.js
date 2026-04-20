const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');

const FLAG_LABELS = {
    ActiveDeveloper: 'Active Developer',
    BugHunterLevel1: 'Bug Hunter Level 1',
    BugHunterLevel2: 'Bug Hunter Level 2',
    CertifiedModerator: 'Certified Moderator',
    HypeSquadOnlineHouse1: 'HypeSquad Bravery',
    HypeSquadOnlineHouse2: 'HypeSquad Brilliance',
    HypeSquadOnlineHouse3: 'HypeSquad Balance',
    Hypesquad: 'HypeSquad Events',
    Partner: 'Partner',
    PremiumEarlySupporter: 'Early Supporter',
    Quarantined: 'Quarantined',
    Spammer: 'Spammer',
    Staff: 'Discord Staff',
    VerifiedBot: 'Verified Bot',
    VerifiedDeveloper: 'Verified Bot Developer'
};

function formatAge(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function summarizeFlags(flags) {
    if (!flags || flags.length === 0) return 'Nenhum';
    return flags.map(flag => FLAG_LABELS[flag] || flag).join(', ').slice(0, 1024);
}

function formatPresence(member) {
    if (!member?.presence) return 'Offline ou oculto';
    const status = member.presence.status || 'offline';
    const activities = member.presence.activities
        .map(activity => activity.name)
        .filter(Boolean)
        .slice(0, 3);
    const clientStatus = member.presence.clientStatus
        ? Object.keys(member.presence.clientStatus).join(', ')
        : null;

    const activityText = activities.length > 0 ? ` | ${activities.join(', ')}` : '';
    const deviceText = clientStatus ? ` | ${clientStatus}` : '';
    return `${status}${activityText}${deviceText}`;
}

function formatVoice(member) {
    if (!member?.voice?.channel) return 'Nao esta em voz';
    const states = [];
    if (member.voice.serverMute) states.push('mutado');
    if (member.voice.serverDeaf) states.push('ensurdecido');
    if (member.voice.streaming) states.push('streaming');
    if (member.voice.selfMute) states.push('self-mute');
    if (member.voice.selfDeaf) states.push('self-deaf');
    const stateText = states.length > 0 ? ` (${states.join(', ')})` : '';
    return `${member.voice.channel.name}${stateText}`;
}

function formatPermissions(member) {
    if (!member) return 'Nao disponivel';
    const perms = member.permissions.toArray();
    if (perms.length === 0) return 'Nenhuma permissao especial';
    return perms.slice(0, 14).join(', ');
}

function scoreRisk({
    accountAgeDays,
    joinAgeDays,
    hasDefaultAvatar,
    rolesCount,
    pending,
    isBot
}) {
    let score = 0;
    const reasons = [];

    if (!isBot) {
        if (accountAgeDays < 7) {
            score += 3;
            reasons.push('Conta criada ha menos de 7 dias');
        } else if (accountAgeDays < 30) {
            score += 2;
            reasons.push('Conta criada ha menos de 30 dias');
        }
    }

    if (joinAgeDays !== null && joinAgeDays < 1) {
        score += 2;
        reasons.push('Entrou no servidor nas ultimas 24h');
    } else if (joinAgeDays !== null && joinAgeDays < 7) {
        score += 1;
        reasons.push('Entrou no servidor ha menos de 7 dias');
    }

    if (hasDefaultAvatar) {
        score += 1;
        reasons.push('Avatar padrao');
    }

    if (rolesCount !== null && rolesCount <= 1) {
        score += 1;
        reasons.push('Sem cargos relevantes');
    }

    if (pending) {
        score += 1;
        reasons.push('Em triagem (pending)');
    }

    if (isBot) {
        reasons.push('Conta bot');
    }

    let level = 'Baixo';
    let color = '#57F287';
    if (score >= 5) {
        level = 'Alto';
        color = '#ED4245';
    } else if (score >= 3) {
        level = 'Medio';
        color = '#FEE75C';
    }

    return { score, level, color, reasons };
}

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Relatorio avancado de seguranca e identidade do usuario.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuario para consulta').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('id').setDescription('ID ou mencao do usuario').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const userOption = interaction.options.getUser('usuario');
        const rawId = parseUserId(interaction.options.getString('id'));
        const targetId = userOption?.id || rawId;

        if (!targetId) {
            await interaction.reply({ content: 'Informe um usuario ou ID para consulta.', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const user = userOption || await interaction.client.users.fetch(targetId, { force: true });
            const member = await interaction.guild.members.fetch(targetId).catch(() => null);

            const flags = await user.fetchFlags().then(result => result.toArray()).catch(() => []);
            const bannerUrl = user.bannerURL({ size: 2048 });
            const avatarUrl = user.displayAvatarURL({ size: 2048, forceStatic: false });
            const decorationUrl = user.avatarDecorationURL ? user.avatarDecorationURL() : null;
            const accentColor = user.accentColor;

            const now = Date.now();
            const accountAgeMs = now - user.createdTimestamp;
            const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
            const joinAgeMs = member?.joinedTimestamp ? now - member.joinedTimestamp : null;
            const joinAgeDays = joinAgeMs !== null ? Math.floor(joinAgeMs / (24 * 60 * 60 * 1000)) : null;
            const hasDefaultAvatar = !user.avatar;

            const rolesCount = member ? member.roles.cache.size : null;
            const highestRole = member ? member.roles.highest : null;
            const pending = Boolean(member?.pending);

            const risk = scoreRisk({
                accountAgeDays,
                joinAgeDays,
                hasDefaultAvatar,
                rolesCount,
                pending,
                isBot: user.bot
            });

            const moderationProfile = PunishmentSystem.getUserProfile(interaction.guild.id, user.id);

            const identityEmbed = new EmbedBuilder()
                .setTitle(`USER INTEL | ${user.tag}`)
                .setColor(member?.displayHexColor || risk.color)
                .setThumbnail(avatarUrl)
                .setDescription(
                    `Risco: **${risk.level}** (score ${risk.score})\n` +
                    (risk.reasons.length > 0 ? `Sinais: ${risk.reasons.join(' | ')}` : 'Sem sinais criticos no momento.')
                )
                .addFields(
                    { name: 'ID', value: user.id, inline: true },
                    { name: 'Tipo', value: user.bot ? 'Bot' : 'Usuario', inline: true },
                    { name: 'Sistema', value: user.system ? 'Sim' : 'Nao', inline: true },
                    { name: 'Global name', value: user.globalName || 'Nao definido', inline: true },
                    { name: 'Criado em', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: 'Idade da conta', value: formatAge(accountAgeMs), inline: true },
                    { name: 'Flags', value: summarizeFlags(flags), inline: false }
                )
                .setTimestamp();

            const serverEmbed = new EmbedBuilder()
                .setTitle('SERVER CONTEXT')
                .setColor(member?.displayHexColor || '#5865F2')
                .addFields(
                    {
                        name: 'Entrada no servidor',
                        value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Nao esta no servidor',
                        inline: true
                    },
                    {
                        name: 'Tempo no servidor',
                        value: joinAgeMs ? formatAge(joinAgeMs) : 'Nao disponivel',
                        inline: true
                    },
                    {
                        name: 'Pending',
                        value: pending ? 'Sim' : 'Nao',
                        inline: true
                    },
                    {
                        name: 'Display name',
                        value: member?.displayName || user.username,
                        inline: true
                    },
                    {
                        name: 'Cargo mais alto',
                        value: highestRole ? highestRole.name : 'Nao disponivel',
                        inline: true
                    },
                    {
                        name: 'Quantidade de cargos',
                        value: rolesCount !== null ? String(rolesCount - 1) : 'Nao disponivel',
                        inline: true
                    },
                    {
                        name: 'Timeout ativo',
                        value: member?.communicationDisabledUntilTimestamp
                            ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>`
                            : 'Nao',
                        inline: true
                    },
                    {
                        name: 'Boost',
                        value: member?.premiumSinceTimestamp
                            ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:F>`
                            : 'Nao',
                        inline: true
                    },
                    {
                        name: 'Presenca',
                        value: formatPresence(member),
                        inline: false
                    },
                    {
                        name: 'Voz',
                        value: formatVoice(member),
                        inline: false
                    },
                    {
                        name: 'Permissoes (parcial)',
                        value: formatPermissions(member).slice(0, 1024),
                        inline: false
                    }
                )
                .setTimestamp();

            if (member) {
                const roles = member.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => role.name)
                    .slice(0, 25);

                serverEmbed.addFields({
                    name: `Cargos (${roles.length})`,
                    value: roles.length > 0 ? roles.join(', ').slice(0, 1024) : 'Nenhum',
                    inline: false
                });
            }

            const securityEmbed = new EmbedBuilder()
                .setTitle('SECURITY SIGNALS')
                .setColor(risk.color)
                .addFields(
                    { name: 'Historico local', value: `Casos: ${moderationProfile.totalCases} | Warns ativos: ${moderationProfile.activeWarnings.length}`, inline: true },
                    { name: 'Avatar padrao', value: hasDefaultAvatar ? 'Sim' : 'Nao', inline: true },
                    { name: 'Banner', value: bannerUrl ? 'Disponivel' : 'Nao possui', inline: true },
                    { name: 'Decoracao', value: decorationUrl ? 'Disponivel' : 'Nao possui', inline: true }
                )
                .setTimestamp();

            const assetsEmbed = new EmbedBuilder()
                .setTitle('ASSETS')
                .setColor(accentColor || '#2B2D31')
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: 'Avatar URL', value: avatarUrl.slice(0, 1024), inline: false },
                    { name: 'Banner URL', value: bannerUrl ? bannerUrl.slice(0, 1024) : 'Nenhum', inline: false },
                    { name: 'Decoracao URL', value: decorationUrl ? decorationUrl.slice(0, 1024) : 'Nenhum', inline: false }
                );

            if (bannerUrl) {
                assetsEmbed.setImage(bannerUrl);
            }

            await interaction.editReply({
                embeds: [identityEmbed, serverEmbed, securityEmbed, assetsEmbed]
            });
        } catch (error) {
            await interaction.editReply({
                content: 'Nao foi possivel obter dados desse usuario pelo Discord.',
                ephemeral: true
            });
        }
    }
};
