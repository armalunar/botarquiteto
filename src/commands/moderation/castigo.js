const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    formatDuration,
    parseDuration,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('castigo')
        .setDescription('Aplica timeout temporário em um usuário.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário que receberá o timeout').setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duracao')
                .setDescription('Duração ex: 30m, 2h, 1d')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo do timeout').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('usuario');
        const durationInput = interaction.options.getString('duracao');
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Violação das diretrizes do servidor.'
        );

        const validationError = validateModerationTarget(interaction, target);
        if (validationError) {
            await interaction.reply({ content: validationError, ephemeral: true });
            return;
        }

        const durationMs = parseDuration(durationInput);
        if (!durationMs || durationMs <= 0 || durationMs > 28 * 24 * 60 * 60 * 1000) {
            await interaction.reply({
                content: 'Duração inválida. Use formatos como `30m`, `2h` ou `1d` (máximo de 28 dias).',
                ephemeral: true
            });
            return;
        }

        if (!target.moderatable) {
            await interaction.reply({ content: 'Não consigo aplicar timeout neste usuário.', ephemeral: true });
            return;
        }

        const caseRecord = await PunishmentSystem.timeoutMember({
            guild: interaction.guild,
            member: target,
            moderator: interaction.user,
            reason,
            durationMs
        });

        const embed = buildModerationEmbed({
            title: 'Timeout aplicado',
            color: '#E67E22',
            description: `${target} recebeu timeout temporário.`,
            target,
            moderator: interaction.user,
            reason,
            caseRecord,
            extraFields: [
                {
                    name: 'Duração',
                    value: formatDuration(durationMs),
                    inline: true
                },
                {
                    name: 'Fim previsto',
                    value: `<t:${Math.floor(caseRecord.expiresAt / 1000)}:R>`,
                    inline: true
                }
            ]
        });

        await interaction.reply({ embeds: [embed] });
    }
};
