const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulsa um usuário do servidor (kick).')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário que será expulso').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('usuario');
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Comportamento inadequado.'
        );

        const validationError = validateModerationTarget(interaction, target);
        if (validationError) {
            await interaction.reply({ content: validationError, ephemeral: true });
            return;
        }

        if (!target.kickable) {
            await interaction.reply({ content: 'Não consigo expulsar este usuário.', ephemeral: true });
            return;
        }

        const caseRecord = await PunishmentSystem.kickMember({
            guild: interaction.guild,
            member: target,
            moderator: interaction.user,
            reason
        });

        const embed = buildModerationEmbed({
            title: 'Expulsão aplicada',
            color: '#D35400',
            description: `${target.user.tag} foi expulso do servidor.`,
            target,
            moderator: interaction.user,
            reason,
            caseRecord
        });

        await interaction.reply({ embeds: [embed] });
    }
};
