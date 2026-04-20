const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout de um usuário.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário que terá o timeout removido').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da liberação').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('usuario');
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Timeout removido pela equipe de moderação.'
        );

        const validationError = validateModerationTarget(interaction, target);
        if (validationError) {
            await interaction.reply({ content: validationError, ephemeral: true });
            return;
        }

        if (!target.isCommunicationDisabled()) {
            await interaction.reply({ content: 'Este usuário não está em timeout.', ephemeral: true });
            return;
        }

        const caseRecord = await PunishmentSystem.removeTimeout({
            guild: interaction.guild,
            member: target,
            moderator: interaction.user,
            reason
        });

        const embed = buildModerationEmbed({
            title: 'Timeout removido',
            color: '#2ECC71',
            description: `${target} teve o timeout removido.`,
            target,
            moderator: interaction.user,
            reason,
            caseRecord
        });

        await interaction.reply({ embeds: [embed] });
    }
};
