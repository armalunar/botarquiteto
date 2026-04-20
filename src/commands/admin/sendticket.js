const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const TicketSystem = require('../../utils/ticketSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendticket')
        .setDescription('Envia o painel de tickets no canal atual')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        await TicketSystem.sendTicketPanel(interaction.channel);
        return interaction.editReply({ content: '✅ Painel de tickets enviado!' });
    }
};

