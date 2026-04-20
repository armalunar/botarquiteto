const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ChannelType } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    const ticketConfig = Config.get('tickets') || {};
    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const embed = new EmbedBuilder()
        .setTitle('🎫 BotConfig • Tickets & Atendimento')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription('Configure o sistema de tickets do servidor (suporte, transcrições, limites e logs).')
        .addFields(
            { name: '📁 Categoria', value: ticketConfig.categoryId ? `<#${ticketConfig.categoryId}>` : '`Não definida`', inline: true },
            { name: '📋 Canal de logs', value: ticketConfig.logsChannelId ? `<#${ticketConfig.logsChannelId}>` : '`Não definido`', inline: true },
            { name: '🧑‍⚖️ Cargo de suporte', value: ticketConfig.supportRoleId ? `<@&${ticketConfig.supportRoleId}>` : '`Não definido`', inline: true },
            { name: '🔢 Max tickets/usuário', value: `\`${ticketConfig.maxTicketsPerUser || 1}\``, inline: true },
            { name: '🧾 Total de tickets', value: `\`${Config.get('tickets.counter') || 0}\``, inline: true },
            { name: '⚠️ Confirmação de Encerramento', value: ticketConfig.closeConfirmation !== false ? '✅ Ativa' : '❌ Desativada', inline: true },
            { name: '🛰️ Pré-atendimento', value: ticketConfig.intake?.enabled !== false ? '✅ Ativo' : '❌ Desativado', inline: true },
            { name: '💬 Mensagem automática', value: ticketConfig.intake?.autoWelcome !== false ? '✅ Ativa' : '❌ Desativada', inline: true },
            { name: '🛡️ Aviso de segurança', value: ticketConfig.intake?.includeDisclaimer !== false ? '✅ Ativo' : '❌ Desativado', inline: true }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Tickets configuráveis via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const categorySelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('select_channel_ticket_category')
            .setPlaceholder('📁 Selecione a categoria dos tickets')
            .setChannelTypes(ChannelType.GuildCategory)
    );

    const logsSelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('select_channel_ticket_logs')
            .setPlaceholder('📋 Selecione o canal de logs de tickets')
            .setChannelTypes(ChannelType.GuildText)
    );

    const roleSelect = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('config_role_ticket_support')
            .setPlaceholder('🧑‍⚖️ Selecione o cargo de suporte')
    );

    const optionsMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_config_options')
            .setPlaceholder('⚙️ Outras configurações')
            .addOptions([
                { label: ticketConfig.intake?.enabled !== false ? 'Desativar pré-atendimento' : 'Ativar pré-atendimento', value: 'toggle_intake', description: 'Coleta inicial de informações no ticket', emoji: '🛰️' },
                { label: ticketConfig.intake?.autoWelcome !== false ? 'Desativar mensagem automática' : 'Ativar mensagem automática', value: 'toggle_intake_welcome', description: 'Enviar embed automático de checklist', emoji: '💬' },
                { label: ticketConfig.intake?.includeDisclaimer !== false ? 'Desativar aviso de segurança' : 'Ativar aviso de segurança', value: 'toggle_intake_disclaimer', description: 'Aviso: não enviar senhas/tokens', emoji: '🛡️' },
                { label: 'Ver transcrições', value: 'view_history', description: 'Listar tickets encerrados', emoji: '📄' },
                { label: 'Buscar por ID', value: 'search_ticket', description: 'Baixar transcrição pelo ID', emoji: '🔎' },
                { label: 'Definir Max tickets (1)', value: 'max_1', description: '1 ticket por usuário', emoji: '1️⃣' },
                { label: 'Definir Max tickets (2)', value: 'max_2', description: '2 tickets por usuário', emoji: '2️⃣' },
                { label: 'Definir Max tickets (3)', value: 'max_3', description: '3 tickets por usuário', emoji: '3️⃣' },
                { label: 'Definir Max tickets (5)', value: 'max_5', description: '5 tickets por usuário', emoji: '5️⃣' },
                { label: ticketConfig.closeConfirmation !== false ? 'Desativar Confirmação' : 'Ativar Confirmação', value: 'toggle_confirmation', description: 'Pedir confirmação ao encerrar ticket', emoji: '⚠️' },
                { label: 'Resetar Contador', value: 'reset_counter', description: 'Zera o contador de tickets', emoji: '🔄' }
            ])
    );

    const backBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('botconfig_home')
            .setLabel('Voltar')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
    );

    const payload = { embeds: [embed], components: [categorySelect, logsSelect, roleSelect, optionsMenu, backBtn] };

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload);
    } else if (interaction.isMessageComponent()) {
        await interaction.update(payload);
    } else {
        await interaction.reply({ ...payload, ephemeral: true });
    }
};

