const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Expulsa e reintegra para limpar mensagens recentes.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário que receberá o softban').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da ação').setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('limpar_horas')
                .setDescription('Horas de mensagens a limpar (0 a 168)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(168)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction) {
        const target = interaction.options.getMember('usuario');
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Limpeza de histórico com reintegração imediata.'
        );
        const deleteHours = interaction.options.getInteger('limpar_horas') ?? 24;

        const validationError = validateModerationTarget(interaction, target);
        if (validationError) {
            await interaction.reply({ content: validationError, ephemeral: true });
            return;
        }

        if (!target.bannable) {
            await interaction.reply({ content: 'Não consigo aplicar softban neste usuário.', ephemeral: true });
            return;
        }

        const caseRecord = await PunishmentSystem.softBanMember({
            guild: interaction.guild,
            member: target,
            moderator: interaction.user,
            reason,
            deleteMessageSeconds: deleteHours * 60 * 60
        });

        const embed = buildModerationEmbed({
            title: 'Softban aplicado',
            color: '#C0392B',
            description: `${target.user.tag} foi banido e desbanido para limpeza.`,
            target,
            moderator: interaction.user,
            reason,
            caseRecord,
            extraFields: [
                {
                    name: 'Limpeza de mensagens',
                    value: `${deleteHours} hora(s)`,
                    inline: true
                }
            ]
        });

        await interaction.reply({ embeds: [embed] });
    }
};
