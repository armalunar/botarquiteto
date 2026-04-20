const { PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const PunishmentSystem = require('../../utils/punishmentSystem');

const CASE_LABELS = {
    warn: 'ADVERTÊNCIA',
    timeout: 'TIMEOUT',
    kick: 'KICK',
    ban: 'BANIMENTO',
    unban: 'DESBANIMENTO',
    untimeout: 'TIMEOUT REMOVIDO',
    softban: 'SOFTBAN',
    warn_removed: 'ADVERTÊNCIA REMOVIDA',
    warns_cleared: 'ADVERTÊNCIAS LIMPAS'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('historico')
        .setDescription('Mostra o histórico de moderação de um usuário.')
        .addUserOption(option =>
            option.setName('usuario').setDescription('Usuário a consultar').setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('limite').setDescription('Quantidade de casos a exibir').setRequired(false).setMinValue(1).setMaxValue(15)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('usuario', true);
        const limit = interaction.options.getInteger('limite') || 10;
        const profile = PunishmentSystem.getUserProfile(interaction.guild.id, targetUser.id);

        if (profile.totalCases === 0) {
            await interaction.reply({
                content: `Nenhum registro disciplinar encontrado para **${targetUser.tag}**.`,
                ephemeral: true
            });
            return;
        }

        const description = profile.cases
            .slice(0, limit)
            .map(caseRecord => {
                const status = caseRecord.clearedAt ? 'encerrado' : 'ativo';
                const reason = String(caseRecord.reason || 'Sem motivo').slice(0, 90);
                return `**${caseRecord.caseId}** | ${CASE_LABELS[caseRecord.type] || caseRecord.type}\n${status} | <t:${Math.floor(caseRecord.createdAt / 1000)}:R>\n${reason}`;
            })
            .join('\n\n')
            .slice(0, 4000);

        const embed = new EmbedBuilder()
            .setTitle(`Histórico de moderação: ${targetUser.tag}`)
            .setColor('#5865F2')
            .setThumbnail(targetUser.displayAvatarURL())
            .setDescription(description)
            .addFields(
                {
                    name: 'Casos totais',
                    value: String(profile.totalCases),
                    inline: true
                },
                {
                    name: 'Advertências ativas',
                    value: String(profile.activeWarnings.length),
                    inline: true
                },
                {
                    name: 'Advertências registradas',
                    value: String(profile.totalWarnings),
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
