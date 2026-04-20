const { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    const channels = Config.get('channels') || {};

    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const embed = new EmbedBuilder()
        .setTitle('📢 BotConfig • Canais & Logs')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription('Defina canais de **boas-vindas** e **logs** (geral/moderação/segurança).')
        .addFields(
            { name: '🧾 Logs gerais', value: channels.generalLogs ? `<#${channels.generalLogs}>` : '`Não definido`', inline: true },
            { name: '🧑‍⚖️ Logs de moderação', value: channels.modLogs ? `<#${channels.modLogs}>` : '`Não definido`', inline: true },
            { name: '🛡️ Logs de segurança', value: channels.securityLogs ? `<#${channels.securityLogs}>` : '`Não definido`', inline: true },
            { name: '👋 Boas-vindas', value: channels.welcome ? `<#${channels.welcome}>` : '`Não definido`', inline: true }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Canais configuráveis via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    // Menus (Discord permite máx 5 action rows)
    const selGen = new ChannelSelectMenuBuilder().setCustomId('select_channel_general').setPlaceholder('🧾 Definir logs gerais').setChannelTypes(ChannelType.GuildText);
    const selMod = new ChannelSelectMenuBuilder().setCustomId('select_channel_mod').setPlaceholder('🧑‍⚖️ Definir logs de moderação').setChannelTypes(ChannelType.GuildText);
    const selSec = new ChannelSelectMenuBuilder().setCustomId('select_channel_security').setPlaceholder('🛡️ Definir logs de segurança').setChannelTypes(ChannelType.GuildText);
    
    // NOVO: Seletor de Canal de Boas-vindas
    const selWelcome = new ChannelSelectMenuBuilder().setCustomId('select_channel_welcome').setPlaceholder('👋 Definir canal de boas-vindas').setChannelTypes(ChannelType.GuildText);

    const backBtn = new ButtonBuilder().setCustomId('botconfig_home').setLabel('Voltar').setEmoji('⬅️').setStyle(ButtonStyle.Secondary);

    // Organização das linhas (Rows)
    const row1 = new ActionRowBuilder().addComponents(selGen);
    const row2 = new ActionRowBuilder().addComponents(selMod);
    const row3 = new ActionRowBuilder().addComponents(selSec);
    const row4 = new ActionRowBuilder().addComponents(selWelcome);
    const rowBtn = new ActionRowBuilder().addComponents(backBtn);

    const payload = { content: '', embeds: [embed], components: [row1, row2, row3, row4, rowBtn] };

    // Envio Seguro
    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
    } else {
        await interaction.reply({ ...payload, ephemeral: true });
    }
};
