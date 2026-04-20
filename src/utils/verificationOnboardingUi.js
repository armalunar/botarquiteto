const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const Config = require('./configManager');
const { normalizeGameRoles } = require('./verificationPreferences');

function getProfileConfig() {
    const verification = Config.get('verification') || {};
    const notifyRoleId = String(verification.notifyRoleId || '').trim();
    const games = normalizeGameRoles(verification.gameRoles).filter(entry => /^\d{17,20}$/.test(entry.roleId));
    return { notifyRoleId, games };
}

function formatEmoji(entry) {
    if (!entry?.emoji) return undefined;
    if (typeof entry.emoji === 'string') return entry.emoji;
    if (entry.emoji?.id) {
        return { id: entry.emoji.id, name: entry.emoji.name, animated: Boolean(entry.emoji.animated) };
    }
    return undefined;
}

function buildVerificationOnboardingPayload({ guild, member }) {
    const { notifyRoleId, games } = getProfileConfig();
    const verifiedRoleId = String(Config.get('roles.verified') || '').trim();

    const hasNotify = Boolean(notifyRoleId && member?.roles?.cache?.has?.(notifyRoleId));
    const selectedGames = games.filter(entry => member?.roles?.cache?.has?.(entry.roleId));

    const embed = new EmbedBuilder()
        .setTitle('✅ Verificação concluída')
        .setColor(0x57F287)
        .setDescription(
            [
                '```fix',
                'STATUS: VERIFIED',
                'PROFILE: OPTIONAL SETUP',
                '```',
                'Antes de continuar, selecione (opcional): **notificações** e **jogos**.',
                '',
                'Você pode alterar isso depois repetindo o processo de seleção.'
            ].join('\n')
        )
        .addFields(
            {
                name: 'Notificações',
                value: notifyRoleId ? (hasNotify ? '🔔 Ativadas' : '🔕 Desativadas') : '`Não configurado pela staff`',
                inline: true
            },
            {
                name: 'Jogos',
                value: games.length
                    ? (selectedGames.length ? selectedGames.map(entry => entry.label).slice(0, 8).join(', ') : '`Nenhum selecionado`')
                    : '`Nenhuma opção configurada`',
                inline: true
            }
        )
        .setFooter({ text: guild?.name || Config.get('bot.name') || 'Servidor' });

    if (verifiedRoleId) {
        embed.addFields({
            name: 'Acesso',
            value: `Cargo: <@&${verifiedRoleId}>`,
            inline: false
        });
    }

    const components = [];

    const notifyMenu = new StringSelectMenuBuilder()
        .setCustomId('verify_profile_notify')
        .setPlaceholder(notifyRoleId ? '🔔 Notificações' : '🔔 Notificações (indisponível)')
        .setDisabled(!notifyRoleId)
        .addOptions([
            {
                label: 'Receber notificações',
                value: 'on',
                description: 'Ativa o cargo de notificações do servidor',
                emoji: '🔔',
                default: Boolean(notifyRoleId && hasNotify)
            },
            {
                label: 'Não receber notificações',
                value: 'off',
                description: 'Não atribui o cargo de notificações',
                emoji: '🔕',
                default: Boolean(notifyRoleId && !hasNotify)
            }
        ]);

    components.push(new ActionRowBuilder().addComponents(notifyMenu));

    const gamesMenu = new StringSelectMenuBuilder()
        .setCustomId('verify_profile_games')
        .setPlaceholder(games.length ? '🎮 Selecionar jogos' : '🎮 Jogos (indisponível)')
        .setDisabled(games.length === 0)
        .setMinValues(0)
        .setMaxValues(Math.min(10, Math.max(1, games.length)));

    if (games.length) {
        gamesMenu.addOptions(
            games.slice(0, 25).map(entry => ({
                label: entry.label.slice(0, 100),
                value: entry.key,
                description: entry.roleId ? `Cargo: ${entry.roleId}`.slice(0, 100) : 'Cargo não configurado',
                default: selectedGames.some(sel => sel.key === entry.key),
                emoji: formatEmoji(entry)
            }))
        );
    }

    components.push(new ActionRowBuilder().addComponents(gamesMenu));

    return {
        content: '',
        embeds: [embed],
        components
    };
}

module.exports = {
    buildVerificationOnboardingPayload,
    getProfileConfig
};

