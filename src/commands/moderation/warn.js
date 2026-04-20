const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    formatDuration,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Aplica uma advertência a um usuário.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário que receberá a advertência').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da advertência').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('usuario');
        const reason = sanitizeReason(interaction.options.getString('motivo'));

        const validationError = validateModerationTarget(interaction, target);
        if (validationError) {
            await interaction.reply({ content: validationError, ephemeral: true });
            return;
        }

        const result = await PunishmentSystem.warnMember({
            guild: interaction.guild,
            member: target,
            moderator: interaction.user,
            reason
        });

        const extraFields = [
            {
                name: 'Advertências ativas',
                value: String(result.activeWarnings),
                inline: true
            }
        ];

        if (result.caseRecord.expiresAt) {
            extraFields.push({
                name: 'Expira em',
                value: `<t:${Math.floor(result.caseRecord.expiresAt / 1000)}:R>`,
                inline: true
            });
        }

        if (result.escalation?.caseRecord) {
            extraFields.push({
                name: 'Escalonamento',
                value: result.escalation.action === 'timeout'
                    ? `Timeout automático de ${formatDuration(result.escalation.durationMs)}`
                    : 'Banimento automático aplicado',
                inline: false
            });
        } else if (result.escalation?.skipped) {
            extraFields.push({
                name: 'Escalonamento',
                value: result.escalation.reason,
                inline: false
            });
        }

        const embed = buildModerationEmbed({
            title: 'Advertência registrada',
            color: '#F1C40F',
            description: `${target} recebeu uma advertência.`,
            target,
            moderator: interaction.user,
            reason,
            caseRecord: result.caseRecord,
            extraFields
        });

        await interaction.reply({ embeds: [embed] });
    }
};
