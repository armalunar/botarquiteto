const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');
const { buildModerationEmbed, sanitizeReason } = require('../../utils/moderationUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('limparwarns')
        .setDescription('Remove todas as advertências ativas de um usuário.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário alvo').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('motivo').setDescription('Motivo da limpeza').setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario', true);
        const reason = sanitizeReason(
            interaction.options.getString('motivo'),
            'Todas as advertências ativas foram removidas.'
        );

        const result = PunishmentSystem.clearWarnings({
            guildId: interaction.guild.id,
            userId: targetUser.id,
            moderatorId: interaction.user.id,
            reason
        });

        if (!result) {
            await interaction.reply({ content: 'Esse usuário não possui advertências ativas.', ephemeral: true });
            return;
        }

        await PunishmentSystem.logCase(interaction.guild, targetUser.id, result.audit);

        const embed = buildModerationEmbed({
            title: 'Advertências limpas',
            color: '#2ECC71',
            description: `${result.clearedCount} advertência(s) ativa(s) foram removidas.`,
            target: targetUser,
            moderator: interaction.user,
            reason,
            caseRecord: result.audit
        });

        await interaction.reply({ embeds: [embed] });
    }
};
