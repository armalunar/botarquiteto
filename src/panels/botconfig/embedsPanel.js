const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');

module.exports = async (interaction) => {
    // 1. LÃ³gica Inteligente para saber qual Embed estamos editando
    let selectedType = 'verification'; // PadrÃ£o

    // Se o usuÃ¡rio selecionou no dropdown agora
    if (interaction.customId === 'select_embed_type' && interaction.values && interaction.values.length > 0) {
        selectedType = interaction.values[0];
    }
    // Se o usuÃ¡rio clicou em uma aÃ§Ã£o (ex: Editar Texto)
    else if (interaction.customId && interaction.customId.startsWith('select_embed_action:')) {
        selectedType = interaction.customId.split(':')[1];
    }
    // Se veio do Modal de Salvar
    else if (interaction.customId && interaction.customId.startsWith('modal_embed_save:')) {
        selectedType = interaction.customId.split(':')[1];
    }

    // Carrega a config atual
    const config = Config.get(`embeds.${selectedType}`) || {};

    // 2. Monta o Preview
    const previewEmbed = new EmbedBuilder()
        .setTitle(config.title || 'Título não definido')
        .setDescription(config.description || 'Descrição não definida')
        .setColor(config.color || '#0B1E3A');

    if (config.image) previewEmbed.setImage(config.image);
    if (config.thumbnail) previewEmbed.setThumbnail(config.thumbnail);
    if (config.footer) previewEmbed.setFooter({ text: String(config.footer).slice(0, 2048) });
    if (config.author) previewEmbed.setAuthor({ name: config.author });

    // 3. Menu de Tipos (Com persistÃªncia visual)
    const typeSelect = new StringSelectMenuBuilder()
        .setCustomId('select_embed_type')
        .setPlaceholder('📄 Mudar painel...')
        .addOptions([
            { 
                label: 'Painel de Verificação', 
                value: 'verification', 
                description: 'Painel público de verificação',
                emoji: '🆔',
                default: selectedType === 'verification'
            },
            { 
                label: 'Diretrizes (DM)', 
                value: 'rules_dm', 
                description: 'Enviado no privado após verificação',
                emoji: '📘',
                default: selectedType === 'rules_dm'
            },
            { 
                label: 'Boas-vindas', 
                value: 'welcome', 
                description: 'Mensagem pública de entrada',
                emoji: '👋',
                default: selectedType === 'welcome'
            }
        ]);

    // 4. Menu de AÃ§Ãµes
    const actionSelect = new StringSelectMenuBuilder()
        .setCustomId(`select_embed_action:${selectedType}`)
        .setPlaceholder(`✏️ Editando: ${selectedType.toUpperCase()}`)
        .addOptions([
            { label: 'Editar Conteúdo', value: 'edit_content', description: 'Título e Descrição', emoji: '📝' },
            { label: 'Editar Visual', value: 'edit_visual', description: 'Cor, Imagem e Thumbnail', emoji: '🎨' },
            { label: 'Editar Extras', value: 'edit_extra', description: 'Rodapé e Autor', emoji: '⚙️' }
        ]);

    const backBtn = new ButtonBuilder().setCustomId('botconfig_home').setLabel('Voltar').setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(typeSelect);
    const row2 = new ActionRowBuilder().addComponents(actionSelect);
    const row3 = new ActionRowBuilder().addComponents(backBtn);

    const payload = { 
        content: `🧩 **Editor de Embeds**\nVisualizando: \`${selectedType}\``, 
        embeds: [previewEmbed], 
        components: [row1, row2, row3] 
    };

    // 5. Envio Robusto (Corrige o erro InteractionAlreadyReplied)
    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
    } else {
        await interaction.reply({ ...payload, ephemeral: true });
    }
};
