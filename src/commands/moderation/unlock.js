const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Libera o canal atual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { SendMessages: null });
        
        const embed = new EmbedBuilder()
            .setTitle('🔓 Canal liberado')
            .setDescription('Este canal foi liberado novamente para todos os membros.')
            .setColor('#57F287')
            .setTimestamp();
            
        await interaction.reply({ embeds: [embed] });
    }
};
