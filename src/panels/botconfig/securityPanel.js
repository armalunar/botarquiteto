const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const Config = require('../../utils/configManager');
const AntiRaidSystem = require('../../utils/antiRaidSystem');

function formatMs(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
}

module.exports = async (interaction) => {
    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const antiRaid = AntiRaidSystem.getAntiRaidConfig();
    const raidStatus = AntiRaidSystem.getRaidStatus(interaction.guild?.id);
    const securityLogs = Config.get('channels.securityLogs') || Config.get('channels.modLogs') || '';

    const raidModeLabel = raidStatus.active ? 'ATIVO' : 'INATIVO';
    const raidModeLine = raidStatus.active
        ? `EXPIRA: <t:${Math.floor(raidStatus.raidUntil / 1000)}:R>`
        : 'EXPIRA: —';

    const embed = new EmbedBuilder()
        .setTitle('🛡️ BotConfig • Segurança & Anti-Raid')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription(
            [
                '```fix',
                `ANTI-RAID: ${antiRaid.enabled ? 'ON' : 'OFF'}`,
                `RAID MODE: ${raidModeLabel}`,
                raidModeLine,
                '```',
                'Proteção automática contra entradas em massa com **gate opcional** para bloquear mensagens de não-verificados durante o modo Anti-Raid.'
            ].join('\n')
        )
        .addFields(
            {
                name: 'Detecção',
                value: `Limite: \`${antiRaid.joinThreshold}\`\nJanela: \`${formatMs(antiRaid.joinWindowMs)}\``,
                inline: true
            },
            {
                name: 'Operação',
                value: `Duração do modo: \`${formatMs(antiRaid.raidModeDurationMs)}\`\nCooldown alerta: \`${formatMs(antiRaid.alertCooldownMs)}\``,
                inline: true
            },
            {
                name: 'Ações',
                value: [
                    `Gate (não-verificados): \`${antiRaid.blockUnverifiedMessages ? 'ON' : 'OFF'}\``,
                    `DM ao entrar (raid): \`${antiRaid.dmOnRaidJoin ? 'ON' : 'OFF'}\``,
                    `Quarentena: ${antiRaid.quarantineRoleId ? `<@&${antiRaid.quarantineRoleId}>` : '`Não definido`'}`
                ].join('\n'),
                inline: false
            },
            {
                name: 'Logs',
                value: securityLogs ? `<#${securityLogs}>` : '`Não definido`',
                inline: true
            }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Segurança configurável via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const toggleMenu = new StringSelectMenuBuilder()
        .setCustomId('antiraid_toggle_actions')
        .setPlaceholder('Alternar recursos')
        .addOptions([
            {
                label: antiRaid.enabled ? 'Desativar Anti-Raid' : 'Ativar Anti-Raid',
                value: 'toggle_enabled',
                description: 'Liga/desliga a detecção e o modo Anti-Raid',
                emoji: antiRaid.enabled ? '🟥' : '🟩'
            },
            {
                label: antiRaid.blockUnverifiedMessages ? 'Desativar gate de não-verificados' : 'Ativar gate de não-verificados',
                value: 'toggle_gate',
                description: 'Bloqueia mensagens de não-verificados durante raid',
                emoji: '🛡️'
            },
            {
                label: antiRaid.dmOnRaidJoin ? 'Desativar DM ao entrar (raid)' : 'Ativar DM ao entrar (raid)',
                value: 'toggle_dm_on_join',
                description: 'Envia DM explicando restrições no modo raid',
                emoji: '📩'
            },
            {
                label: 'Limpar cargo de quarentena',
                value: 'clear_quarantine',
                description: 'Remove o cargo configurado de quarentena',
                emoji: '🧹'
            }
        ]);

    const valueMenu = new StringSelectMenuBuilder()
        .setCustomId('antiraid_value_actions')
        .setPlaceholder('Ajustes de limite e tempo')
        .addOptions([
            { label: 'Limite: 3 entradas', value: 'threshold_3', description: 'Dispara com 3 entradas na janela', emoji: '3️⃣' },
            { label: 'Limite: 5 entradas', value: 'threshold_5', description: 'Dispara com 5 entradas na janela', emoji: '5️⃣' },
            { label: 'Limite: 8 entradas', value: 'threshold_8', description: 'Dispara com 8 entradas na janela', emoji: '8️⃣' },
            { label: 'Limite: 12 entradas', value: 'threshold_12', description: 'Dispara com 12 entradas na janela', emoji: '🔟' },
            { label: 'Janela: 15s', value: 'window_15', description: 'Janela de análise: 15 segundos', emoji: '⏱️' },
            { label: 'Janela: 30s', value: 'window_30', description: 'Janela de análise: 30 segundos', emoji: '⏱️' },
            { label: 'Janela: 60s', value: 'window_60', description: 'Janela de análise: 60 segundos', emoji: '⏱️' },
            { label: 'Janela: 120s', value: 'window_120', description: 'Janela de análise: 2 minutos', emoji: '⏱️' },
            { label: 'Duração modo: 5m', value: 'duration_5', description: 'Raid mode por 5 minutos', emoji: '⌛' },
            { label: 'Duração modo: 10m', value: 'duration_10', description: 'Raid mode por 10 minutos', emoji: '⌛' },
            { label: 'Duração modo: 20m', value: 'duration_20', description: 'Raid mode por 20 minutos', emoji: '⌛' },
            { label: 'Duração modo: 60m', value: 'duration_60', description: 'Raid mode por 1 hora', emoji: '⌛' },
            { label: 'Cooldown alerta: 60s', value: 'cooldown_60', description: 'Permite alerta a cada 60 segundos', emoji: '🔁' },
            { label: 'Cooldown alerta: 3m', value: 'cooldown_180', description: 'Permite alerta a cada 3 minutos', emoji: '🔁' },
            { label: 'Cooldown alerta: 5m', value: 'cooldown_300', description: 'Permite alerta a cada 5 minutos', emoji: '🔁' },
            { label: 'Cooldown alerta: 15m', value: 'cooldown_900', description: 'Permite alerta a cada 15 minutos', emoji: '🔁' },
            { label: 'Definir limite customizado', value: 'threshold_custom', description: 'Insere um valor manual via formulário', emoji: '✍️' }
        ]);

    const quarantineSelect = new RoleSelectMenuBuilder()
        .setCustomId('config_antiraid_quarantine_role')
        .setPlaceholder('🧪 Selecionar cargo de quarentena (opcional)')
        .setMaxValues(1);

    if (antiRaid.quarantineRoleId) {
        quarantineSelect.setDefaultRoles([antiRaid.quarantineRoleId]);
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
            new ActionRowBuilder().addComponents(toggleMenu),
            new ActionRowBuilder().addComponents(valueMenu),
            new ActionRowBuilder().addComponents(quarantineSelect),
            new ActionRowBuilder().addComponents(backBtn)
        ]
    };

    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.update(payload);
        return;
    }

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    await interaction.reply({ ...payload, ephemeral: true });
};

