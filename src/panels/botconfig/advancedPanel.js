const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const embed = new EmbedBuilder()
        .setTitle('🚀 BotConfig • Avançado')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription('Operações administrativas e rotinas de segurança do Toxic 2.0.')
        .addFields(
            { name: '📦 Memória em Uso', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
            { name: '⏱️ Uptime', value: `${Math.floor(process.uptime())} segundos`, inline: true },
            { name: '📂 Configuração', value: '`data/config.json` (sem segredos)', inline: false }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Avançado' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const btnReload = new ButtonBuilder()
        .setCustomId('sys_reload_cmds') // Implementar no buttonHandler se necessário
        .setLabel('Recarregar Comandos')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true); // Desativado na demo para segurança

    const btnBackup = new ButtonBuilder()
        .setCustomId('botconfig_sys_backup') // ID OBRIGATÓRIO PARA O HANDLER FUNCIONAR
        .setLabel('Exportar Config')
        .setEmoji('💾')
        .setStyle(ButtonStyle.Primary);

    const btnReset = new ButtonBuilder()
        .setCustomId('botconfig_sys_reset')
        .setLabel('Resetar Config')
        .setEmoji('🧨')
        .setStyle(ButtonStyle.Danger);

    const backBtn = new ButtonBuilder().setCustomId('botconfig_home').setLabel('Voltar').setEmoji('⬅️').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(btnReload, btnBackup, btnReset);
    const rowBack = new ActionRowBuilder().addComponents(backBtn);

    // Se for update ou reply
    if (interaction.isMessageComponent()) {
        await interaction.update({ embeds: [embed], components: [row, rowBack] });
    } else {
        await interaction.reply({ embeds: [embed], components: [row, rowBack], ephemeral: true });
    }
};
