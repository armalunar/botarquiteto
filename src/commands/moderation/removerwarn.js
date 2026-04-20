const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const { buildModerationEmbed, sanitizeReason } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removerwarn')
        .setDescription('Remove uma advertência específica pelo ID do registro.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário dono da advertência').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('caso').setDescription('ID do caso, ex: CASE-00001').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da remoção').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario', true);
        const caseId = interaction.options.getString('caso', true).trim().toUpperCase();
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Advertência removida pela equipe de moderação.'
        );

        const result = PunishmentSystem.removeWarning({
            guildId: interaction.guild.id,
            userId: targetUser.id,
            caseId,
            moderatorId: interaction.user.id,
            reason
        });

        if (!result) {
            await interaction.reply({ content: 'Não encontrei uma advertência ativa com esse ID.', ephemeral: true });
            return;
        }

        await PunishmentSystem.logCase(interaction.guild, targetUser.id, result.audit);

        const embed = buildModerationEmbed({
            title: 'Advertência removida',
            color: '#2ECC71',
            description: `A advertência ${caseId} foi removida com sucesso.`,
            target: targetUser,
            moderator: interaction.user,
            reason,
            caseRecord: result.audit,
            extraFields: [
                {
                    name: 'Advertência removida',
                    value: result.removed.caseId,
                    inline: true
                }
            ]
        });

        await interaction.reply({ embeds: [embed] });
    }
};
