const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder
} = require('discord.js');

const Config = require('../../utils/configManager');

function formatEscalation(rule) {
    if (rule.action === 'ban') {
        return `${rule.warns} advertências = banimento`;
    }

    return `${rule.warns} advertências = timeout ${rule.duration}`;
}

module.exports = async interaction => {
    const automod = Config.get('automod') || {};
    const moderation = Config.get('moderation') || {};
    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;
    const mandatoryBadWords = ['estupro'];
    const configuredBadWords = Array.isArray(automod.badWords) ? automod.badWords : [];
    const badWords = Array.from(new Set([
        ...mandatoryBadWords,
        ...configuredBadWords.map(word => String(word || '').trim().toLowerCase()).filter(Boolean)
    ]));
    const escalation = Array.isArray(moderation.escalation) ? moderation.escalation : [];

    const embed = new EmbedBuilder()
        .setTitle('🛡️ BotConfig • AutoMod & Segurança')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription('Ative/desative módulos automáticos e gerencie filtros de segurança.')
        .addFields(
            { name: 'Anti-Link', value: automod.antiLink ? 'Ativo' : 'Desativado', inline: true },
            { name: 'Anti-Spam', value: automod.antiSpam ? 'Ativo' : 'Desativado', inline: true },
            { name: 'Anti-Flood', value: automod.antiFlood ? 'Ativo' : 'Desativado', inline: true },
            { name: 'Anti-CAPS', value: automod.capsLock ? 'Ativo' : 'Desativado', inline: true },
            { name: 'Anti-Menção', value: automod.mentionSpam ? 'Ativo' : 'Desativado', inline: true },
            { name: 'Termos proibidos', value: `${badWords.length} cadastrados`, inline: true },
            {
                name: 'Escalonamento',
                value: escalation.length > 0 ? escalation.map(formatEscalation).join('\n').slice(0, 1024) : 'Padrão do sistema',
                inline: false
            },
            {
                name: 'Expiração de advertências',
                value: moderation.warnExpiryDays ? `${moderation.warnExpiryDays} dias` : 'Padrão do sistema',
                inline: true
            }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • AutoMod configurável via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const toggleMenu = new StringSelectMenuBuilder()
        .setCustomId('automod_toggle_select')
        .setPlaceholder('Ativar ou desativar módulos')
        .addOptions([
            { label: `Anti-Link ${automod.antiLink ? '(ativo)' : '(inativo)'}`, value: 'toggle_antilink', description: 'Bloqueia links não autorizados' },
            { label: `Anti-Spam ${automod.antiSpam ? '(ativo)' : '(inativo)'}`, value: 'toggle_antispam', description: 'Bloqueia repetição de mensagens' },
            { label: `Anti-Flood ${automod.antiFlood ? '(ativo)' : '(inativo)'}`, value: 'toggle_antiflood', description: 'Bloqueia envio rápido em sequência' },
            { label: `Anti-CAPS ${automod.capsLock ? '(ativo)' : '(inativo)'}`, value: 'toggle_capslock', description: 'Bloqueia excesso de maiúsculas' },
            { label: `Anti-Menção ${automod.mentionSpam ? '(ativo)' : '(inativo)'}`, value: 'toggle_mentionspam', description: 'Bloqueia excesso de menções' }
        ]);

    const wordsMenu = new StringSelectMenuBuilder()
        .setCustomId('automod_words_action')
        .setPlaceholder('Gerenciar termos proibidos')
        .addOptions([
            { label: 'Adicionar termo', value: 'add_word', description: 'Adiciona palavras à lista' },
            { label: 'Remover termo', value: 'remove_word', description: 'Remove uma palavra da blacklist' },
            { label: 'Listar termos', value: 'list_words', description: 'Exibe todos os termos cadastrados' },
            { label: 'Limpar lista', value: 'clear_words', description: 'Remove todos os termos proibidos' }
        ]);

    const backButton = new ButtonBuilder()
        .setCustomId('botconfig_home')
        .setLabel('Voltar')
        .setStyle(ButtonStyle.Secondary);

    const payload = {
        content: '',
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(toggleMenu),
            new ActionRowBuilder().addComponents(wordsMenu),
            new ActionRowBuilder().addComponents(backButton)
        ]
    };

    if (interaction.isMessageComponent()) {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
        return;
    }

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    await interaction.reply({ ...payload, ephemeral: true });
};
