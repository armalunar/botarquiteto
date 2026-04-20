const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const {
    buildModerationEmbed,
    sanitizeReason,
    validateModerationTarget
} = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bane um usuário do servidor.')
        .addUserOption(option =>
            option.setName('alvo').setDescription('Usuário a ser banido').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo do banimento').setRequired(false)
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
        const targetUser = interaction.options.getUser('alvo', true);
        const targetMember = interaction.options.getMember('alvo') || null;
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Violação das diretrizes do servidor.'
        );
        const deleteHours = interaction.options.getInteger('limpar_horas') || 0;

        if (targetMember) {
            const validationError = validateModerationTarget(interaction, targetMember);
            if (validationError) {
                await interaction.reply({ content: validationError, ephemeral: true });
                return;
            }

            if (!targetMember.bannable) {
                await interaction.reply({ content: 'Não consigo banir este usuário.', ephemeral: true });
                return;
            }
        } else {
            if (targetUser.id === interaction.user.id) {
                await interaction.reply({ content: 'Você não pode se banir.', ephemeral: true });
                return;
            }

            if (targetUser.id === interaction.client.user.id) {
                await interaction.reply({ content: 'Você não pode banir o próprio bot.', ephemeral: true });
                return;
            }
        }

        const caseRecord = await PunishmentSystem.banUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.user,
            reason,
            deleteMessageSeconds: deleteHours * 60 * 60
        });

        const embed = buildModerationEmbed({
            title: 'Banimento aplicado',
            color: '#E74C3C',
            description: `${targetUser.tag} foi banido do servidor.`,
            target: targetUser,
            moderator: interaction.user,
            reason,
            caseRecord,
            extraFields: [
                {
                    name: 'Limpeza de mensagens',
                    value: deleteHours > 0 ? `${deleteHours} hora(s)` : 'Nenhuma',
                    inline: true
                }
            ]
        });

        await interaction.reply({ embeds: [embed] });
    }
};
