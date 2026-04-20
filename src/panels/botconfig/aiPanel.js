const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    // Carrega ou define defaults
    const aiConfig = Config.get('ai') || { keywords: [], phrases: [] };
    const keywordsCount = aiConfig.keywords ? aiConfig.keywords.length : 0;
    const phrasesCount = aiConfig.phrases ? aiConfig.phrases.length : 0;
    const footerText = interaction.guild?.name || Config.get('bot.name') || 'Sistema';

    const embed = new EmbedBuilder()
        .setTitle('💬 Respostas automáticas')
        .setDescription('Configure respostas automáticas para menções ao bot e palavras-chave no chat.')
        .addFields(
            { name: '💬 Palavras-Chave', value: `${keywordsCount} configuradas`, inline: true },
            { name: '🤖 Frases (Menção)', value: `${phrasesCount} configuradas`, inline: true }
        )
        .setColor('#0B1E3A')
        .setFooter({ text: footerText });

    // Menu de AÃ§Ãµes
    const menu = new StringSelectMenuBuilder()
        .setCustomId('ai_action_select')
        .setPlaceholder('O que deseja ajustar?')
        .addOptions([
            { label: 'Adicionar Palavra-Chave', value: 'add_keyword', description: 'Resposta para um gatilho específico', emoji: '➕' },
            { label: 'Remover Palavra-Chave', value: 'remove_keyword', description: 'Apagar um gatilho existente', emoji: '➖' },
            { label: 'Listar Palavras-Chave', value: 'list_keywords', description: 'Ver todas as configurações', emoji: '📜' },
            { label: 'Adicionar Frase (Menção)', value: 'add_phrase', description: 'Nova resposta ao marcar o bot', emoji: '➕' },
            { label: 'Remover Frase (Menção)', value: 'remove_phrase', description: 'Apagar uma resposta de menção', emoji: '➖' },
            { label: 'Listar Frases', value: 'list_phrases', description: 'Ver frases de menção', emoji: '📜' }
        ]);

    const backBtn = new ButtonBuilder().setCustomId('botconfig_home').setLabel('Voltar').setStyle(ButtonStyle.Secondary);
    
    const row1 = new ActionRowBuilder().addComponents(menu);
    const row2 = new ActionRowBuilder().addComponents(backBtn);

    const payload = { content: '', embeds: [embed], components: [row1, row2] };

    // LÃ³gica de envio segura
    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.update(payload);
    } else {
        await interaction.reply({ ...payload, ephemeral: true });
    }
};
