const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');
const { normalizeRoleIds } = require('../../utils/permissionUtils');

module.exports = async (interaction) => {
    try {
        const guildName = interaction.guild?.name || 'Servidor';
        const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

        const roles = Config.get('roles') || {};
        const channels = Config.get('channels') || {};
        const tickets = Config.get('tickets') || {};
        const automod = Config.get('automod') || {};

        const staffRoleIds = normalizeRoleIds(roles.staff);
        const verifiedRoleConfigured = Boolean(roles.verified);
        const ticketsConfigured = Boolean(tickets.categoryId && tickets.logsChannelId && tickets.supportRoleId);
        const logsConfigured = Boolean(channels.generalLogs || channels.modLogs || channels.securityLogs);

        const pending = [];
        if (!staffRoleIds.length) pending.push('Staff/Admin');
        if (!verifiedRoleConfigured) pending.push('Verificado');
        if (!ticketsConfigured) pending.push('Tickets');
        if (!logsConfigured) pending.push('Logs');

        const embed = new EmbedBuilder()
            .setTitle('🛰️ Toxic 2.0 • BotConfig Console')
            .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
            .setDescription(
                [
                    '```fix',
                    `ACCESS GRANTED: ${interaction.user.username.toUpperCase()}`,
                    `GUILD: ${guildName}`,
                    '```',
                    `**Bot:** \`${String(Config.get('bot.name') || 'Toxic 2.0')}\``,
                    `**Presença:** \`${String(Config.get('bot.status') || 'online')}\` • \`${String(Config.get('bot.activityText') || 'Gerenciando a comunidade')}\``,
                    '',
                    pending.length
                        ? `⚠️ **Pendências:** ${pending.map(item => `\`${item}\``).join(' • ')}`
                        : '✅ **Setup:** tudo configurado (pronto para produção).',
                    '',
                    'Selecione um módulo abaixo para configurar o bot.'
                ].join('\n')
            )
            .addFields(
                {
                    name: '🔐 Acesso',
                    value: `Usuário: <@${interaction.user.id}>\nStaff/Admin: \`${staffRoleIds.length}\``,
                    inline: true
                },
                {
                    name: '🛡️ AutoMod',
                    value: `Anti-Spam: \`${automod.antiSpam ? 'ON' : 'OFF'}\`\nAnti-Link: \`${automod.antiLink ? 'ON' : 'OFF'}\``,
                    inline: true
                },
                {
                    name: '🎫 Tickets',
                    value: `Suporte: ${tickets.supportRoleId ? `<@&${tickets.supportRoleId}>` : '`Não definido`'}`,
                    inline: false
                }
            )
            .setColor(0x00E5FF)
            .setFooter({ text: 'Toxic 2.0 • /botconfig' });

        if (guildIconUrl) {
            embed.setThumbnail(guildIconUrl);
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('botconfig_menu_select')
            .setPlaceholder('⚙️ Selecione um módulo')
            .addOptions([
                { label: 'Geral', value: 'config_bot', description: 'Nome, avatar, status e presença', emoji: '🤖' },
                { label: 'Canais', value: 'config_channels', description: 'Boas-vindas e canais de logs', emoji: '📢' },
                { label: 'Cargos', value: 'config_roles', description: 'Staff/Admin (multi), verificado, muted e trusted', emoji: '👑' },
                { label: 'Segurança', value: 'config_security', description: 'Anti-Raid e proteções', emoji: '🛡️' },
                { label: 'Verificação', value: 'config_verification', description: 'Notificações (opt-in) e cargos por jogo', emoji: '🆔' },
                { label: 'AutoMod', value: 'config_automod', description: 'Anti-spam, anti-link e filtros', emoji: '🛡️' },
                { label: 'Tickets', value: 'config_tickets', description: 'Suporte, transcrições e histórico', emoji: '🎫' },
                { label: 'Avançado', value: 'config_advanced', description: 'Backup e reset seguro', emoji: '🚀' }
            ]);

        const row = new ActionRowBuilder().addComponents(select);
        const rowBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('botconfig_sys_backup').setLabel('Exportar Config').setEmoji('💾').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('botconfig_sys_reset').setLabel('Resetar').setEmoji('🧨').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('botconfig_close').setLabel('Fechar').setEmoji('✖️').setStyle(ButtonStyle.Secondary)
        );

        const payload = { 
            content: '',
            embeds: [embed], 
            components: [row, rowBtn] 
        };

        if (interaction.isMessageComponent()) {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(payload);
            } else {
                await interaction.update(payload);
            }
        } else {
            await interaction.editReply(payload);
        }
    } catch (error) {
        console.error('Erro no MainPanel:', error);
        await interaction.editReply({ content: '❌ Erro ao renderizar o painel principal.' });
    }
};
