const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const { buildModerationEmbed, sanitizeReason } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Remove o banimento de um usuário pelo ID.')
        .addStringOption(option =>
            option.setName('id').setDescription('ID do usuário banido').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo do desbanimento').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
        const userId = interaction.options.getString('id', true).trim();
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Banimento removido pela equipe.'
        );

        const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            await interaction.reply({ content: 'Não encontrei esse usuário na lista de banidos.', ephemeral: true });
            return;
        }

        const caseRecord = await PunishmentSystem.unbanUser({
            guild: interaction.guild,
            userId,
            moderator: interaction.user,
            reason
        });

        const embed = buildModerationEmbed({
            title: 'Banimento removido',
            color: '#2ECC71',
            description: `${ban.user.tag} pode entrar no servidor novamente.`,
            target: ban.user,
            moderator: interaction.user,
            reason,
            caseRecord
        });

        await interaction.reply({ embeds: [embed] });
    }
};
