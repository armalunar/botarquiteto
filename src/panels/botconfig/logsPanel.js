const { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    // Exibe todos os canais de log configurados
    const logs = Config.get('channels');
    
    const embed = new EmbedBuilder()
        .setTitle('📜 Logs do Servidor')
        .setDescription('Defina para onde cada tipo de log será enviado.')
        .addFields(
            { name: 'Moderação', value: logs.modLogs ? `<#${logs.modLogs}>` : '❌', inline: true },
            { name: 'Segurança', value: logs.securityLogs ? `<#${logs.securityLogs}>` : '❌', inline: true },
            { name: 'Verificação', value: logs.verifyLogs ? `<#${logs.verifyLogs}>` : '❌', inline: true }
        )
        .setColor('#0B1E3A');

    const select = new ChannelSelectMenuBuilder()
        .setCustomId('config_log_channel_mod') // Simplificado para exemplo, idealmente seria um menu para escolher QUAL log alterar
        .setPlaceholder('Definir Canal de Log de Moderação')
        .setChannelTypes(ChannelType.GuildText);

    const backBtn = new ButtonBuilder().setCustomId('botconfig_home').setLabel('Voltar').setStyle(ButtonStyle.Secondary);

    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(backBtn)] });
};
