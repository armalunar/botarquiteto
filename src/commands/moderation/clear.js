const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Limpa mensagens recentes do canal.')
        .addIntegerOption(option =>
            option
                .setName('quantidade')
                .setDescription('Quantidade de mensagens a apagar (1-99)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(99)
        )
        .addUserOption(option =>
            option
                .setName('usuario')
                .setDescription('Opcional: apaga apenas mensagens deste usuário')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        const amount = interaction.options.getInteger('quantidade', true);
        const targetUser = interaction.options.getUser('usuario');

        if (!targetUser) {
            await interaction.channel.bulkDelete(amount, true);
            const reply = await interaction.reply({
                content: `${amount} mensagem(ns) removidas do canal.`,
                fetchReply: true
            });
            setTimeout(() => reply.delete().catch(() => {}), 3000);
            return;
        }

        const fetchedMessages = await interaction.channel.messages.fetch({ limit: 100 });
        const targetMessages = fetchedMessages.filter(message => message.author.id === targetUser.id);
        const selectedMessages = targetMessages.first(amount);
        const messagesToDelete = fetchedMessages.filter(message =>
            selectedMessages.some(selected => selected.id === message.id)
        );

        if (messagesToDelete.size === 0) {
            await interaction.reply({
                content: 'Não encontrei mensagens recentes desse usuário para remover.',
                ephemeral: true
            });
            return;
        }

        await interaction.channel.bulkDelete(messagesToDelete, true);
        const reply = await interaction.reply({
            content: `${messagesToDelete.size} mensagem(ns) de **${targetUser.tag}** removidas.`,
            fetchReply: true
        });

        setTimeout(() => reply.delete().catch(() => {}), 3000);
    }
};
