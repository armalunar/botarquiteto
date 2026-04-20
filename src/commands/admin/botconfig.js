const { SlashCommandBuilder } = require('discord.js');
const mainPanel = require('../../panels/botconfig/mainPanel');
const Config = require('../../utils/configManager');
const { normalizeRoleIds, isStaffMember } = require('../../utils/permissionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botconfig')
        .setDescription('Painel de configuração do servidor (Admin)'),
    async execute(interaction) {
        if (!interaction.inGuild?.()) {
            return interaction.reply({ content: '❌ Este comando só pode ser usado dentro de um servidor.', ephemeral: true });
        }

        const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
        const allowed = isStaffMember(interaction.member, { staffRoleIds });

        if (!allowed) {
            return interaction.reply({
                content: '❌ Acesso negado. Apenas Administradores ou cargos definidos em `/botconfig` → Cargos → Staff/Admin podem usar este painel.',
                ephemeral: true
            });
        }

        await interaction.reply({ content: '🔄 Carregando painel de configuração...', ephemeral: true });
        await mainPanel(interaction);
    }
};
