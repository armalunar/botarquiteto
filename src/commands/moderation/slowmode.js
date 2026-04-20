const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Define o modo lento no canal.')
        .addIntegerOption(option => option.setName('segundos').setDescription('Tempo em segundos (0 para desativar)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
        const seconds = interaction.options.getInteger('segundos');
        await interaction.channel.setRateLimitPerUser(seconds);
        
        const embed = new EmbedBuilder()
            .setTitle('⏳ Modo Lento Atualizado')
            .setDescription(seconds > 0 ? `O ritmo entre mensagens agora é de **${seconds} segundos**.` : 'O modo lento foi desativado.')
            .setColor('#5865F2')
            .setTimestamp();
            
        await interaction.reply({ embeds: [embed] });
    }
};
