const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Bloqueia o canal atual para mensagens de membros.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: false });
        
        const embed = new EmbedBuilder()
            .setTitle('🔒 Canal bloqueado')
            .setDescription('Este canal foi bloqueado pela moderação. Apenas a staff pode enviar mensagens.')
            .setColor('#ED4245')
            .setTimestamp();
            
        await interaction.reply({ embeds: [embed] });
    }
};
