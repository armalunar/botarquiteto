const {
    EmbedBuilder,
    ActionRowBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');

const Config = require('../../utils/configManager');
const BotconfigState = require('../../utils/botconfigState');
const { normalizeGameRoles } = require('../../utils/verificationPreferences');

function clampText(text, maxLength) {
    const value = String(text || '');
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatGameList(gameRoles) {
    if (!gameRoles.length) {
        return '`Nenhum jogo cadastrado`';
    }

    const lines = gameRoles.slice(0, 20).map(entry => {
        const emojiText = typeof entry.emoji === 'string'
            ? `${entry.emoji} `
            : (entry.emoji?.id
                ? `<${entry.emoji.animated ? 'a' : ''}:${entry.emoji.name}:${entry.emoji.id}> `
                : '');

        const roleText = entry.roleId ? `<@&${entry.roleId}>` : '`Sem cargo`';
        return `${emojiText}**${entry.label}** → ${roleText}`;
    });

    if (gameRoles.length > 20) {
        lines.push(`… e mais **${gameRoles.length - 20}** jogo(s).`);
    }

    return clampText(lines.join('\n'), 1024);
}

module.exports = async (interaction) => {
    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const verifiedRoleId = String(Config.get('roles.verified') || '').trim();
    const verification = Config.get('verification') || {};
    const notifyRoleId = String(verification.notifyRoleId || '').trim();
    const games = normalizeGameRoles(verification.gameRoles);

    const state = BotconfigState.get(interaction.user.id) || {};
    const selectedAction = state.verificationGamesAction || 'set_role';

    const stateSelectedKey = String(state.verificationGameKey || '').trim();
    const selectedKey = games.some(game => game.key === stateSelectedKey)
        ? stateSelectedKey
        : (games[0]?.key || '');

    const selectedGame = selectedKey
        ? games.find(game => game.key === selectedKey) || null
        : null;

    const embed = new EmbedBuilder()
        .setTitle('🆔 BotConfig • Verificação & Preferências')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription(
            [
                'Configure o onboarding de **verificação**: opt-in de notificações e cargos por jogo.',
                '',
                '```fix',
                `VERIFICADO: ${verifiedRoleId ? 'OK' : 'NÃO CONFIGURADO'}`,
                `NOTIFICAÇÕES: ${notifyRoleId ? 'OK' : 'NÃO CONFIGURADO'}`,
                `JOGOS: ${games.length}`,
                '```'
            ].join('\n')
        )
        .addFields(
            {
                name: 'Cargo de verificação',
                value: verifiedRoleId
                    ? `<@&${verifiedRoleId}>`
                    : '⚠️ Defina em `/botconfig` → **Cargos** (Verificado).',
                inline: false
            },
            {
                name: 'Cargo de notificações (opt-in)',
                value: notifyRoleId ? `<@&${notifyRoleId}>` : '`Não definido`',
                inline: true
            },
            {
                name: 'Jogos (cargos por jogo)',
                value: formatGameList(games),
                inline: false
            }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Verificação configurável via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const notifyRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId('config_verify_notify_role')
        .setPlaceholder('🔔 Selecionar cargo de notificações (opt-in)')
        .setMaxValues(1);

    if (notifyRoleId) {
        notifyRoleSelect.setDefaultRoles([notifyRoleId]);
    }

    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId('verification_games_action')
        .setPlaceholder('Gerenciar jogos')
        .addOptions([
            {
                label: 'Adicionar jogo',
                value: 'add_game',
                description: 'Cria um jogo (nome/emoji)',
                emoji: '➕',
                default: selectedAction === 'add_game'
            },
            {
                label: 'Definir cargo do jogo',
                value: 'set_role',
                description: 'Seleciona um jogo e define o cargo',
                emoji: '🎮',
                default: selectedAction === 'set_role'
            },
            {
                label: 'Remover jogo',
                value: 'remove_game',
                description: 'Remove o jogo da lista de onboarding',
                emoji: '🗑️',
                default: selectedAction === 'remove_game'
            }
        ]);

    const gameOptions = games.length
        ? games.slice(0, 25).map(game => {
            const option = {
                label: clampText(game.label, 100),
                value: String(game.key),
                description: clampText(
                    game.roleId ? `Cargo: ${game.roleId}` : 'Cargo: não definido',
                    100
                ),
                default: Boolean(selectedKey && game.key === selectedKey)
            };

            if (typeof game.emoji === 'string' && game.emoji.trim()) {
                option.emoji = game.emoji;
            } else if (game.emoji?.id) {
                option.emoji = {
                    id: game.emoji.id,
                    name: game.emoji.name,
                    animated: Boolean(game.emoji.animated)
                };
            }

            return option;
        })
        : [
            {
                label: 'Nenhum jogo cadastrado',
                value: 'no_games_available',
                description: 'Adicione um jogo primeiro'
            }
        ];

    const gameTargetSelect = new StringSelectMenuBuilder()
        .setCustomId('verification_games_target')
        .setPlaceholder(games.length ? 'Selecione um jogo' : 'Nenhum jogo cadastrado')
        .setDisabled(games.length === 0)
        .addOptions(gameOptions);

    const roleMenuDisabled = !(selectedAction === 'set_role' && selectedGame);
    const roleMenuCustomId = selectedGame
        ? `config_verify_game_role:${selectedGame.key}`
        : 'config_verify_game_role:none';

    const gameRoleSelect = new RoleSelectMenuBuilder()
        .setCustomId(roleMenuCustomId)
        .setPlaceholder(
            selectedGame
                ? `Cargo para: ${clampText(selectedGame.label, 80)}`
                : 'Selecione um jogo para definir cargo'
        )
        .setMaxValues(1)
        .setDisabled(roleMenuDisabled);

    if (!roleMenuDisabled && selectedGame?.roleId) {
        gameRoleSelect.setDefaultRoles([selectedGame.roleId]);
    }

    const backBtn = new ButtonBuilder()
        .setCustomId('botconfig_home')
        .setLabel('Voltar')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary);

    const payload = {
        content: '',
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(notifyRoleSelect),
            new ActionRowBuilder().addComponents(actionSelect),
            new ActionRowBuilder().addComponents(gameTargetSelect),
            new ActionRowBuilder().addComponents(gameRoleSelect),
            new ActionRowBuilder().addComponents(backBtn)
        ]
    };

    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
        return;
    }

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    await interaction.reply({
        ...payload,
        flags: MessageFlags.Ephemeral
    });
};