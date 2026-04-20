const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const Config = require('../../utils/configManager');
const { normalizeRoleIds } = require('../../utils/permissionUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sendregras')
        .setDescription('Envia painel de regras + verificação neste canal')
        .addChannelOption(option =>
            option
                .setName('canal')
                .setDescription('Canal onde enviar as regras')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
        if (!targetChannel?.isTextBased?.()) {
            return interaction.editReply({ content: '❌ Canal inválido.' });
        }

        const nowUnix = Math.floor(Date.now() / 1000);
        const guildName = interaction.guild?.name || 'Toxic 2.0';
        const guildIconUrl = interaction.guild?.iconURL({ size: 256 }) || null;
        const guildBannerUrl = interaction.guild?.bannerURL({ size: 1024 }) || null;

        const verifiedRoleId = Config.get('roles.verified');
        const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
        const supportRoleId = Config.get('tickets.supportRoleId');

        const verifiedRoleMention = verifiedRoleId ? `<@&${verifiedRoleId}>` : '`Verificado`';
        const staffMention = staffRoleIds[0] ? `<@&${staffRoleIds[0]}>` : '`Staff`';
        const supportMention = supportRoleId ? `<@&${supportRoleId}>` : staffMention;

        const embed = new EmbedBuilder()
            .setTitle(`🧾 ${guildName} • Protocolo de Acesso & Regras`)
            .setURL('https://discord.com/guidelines')
            .setAuthor({
                name: `${guildName} • Security Console`,
                iconURL: guildIconUrl || undefined
            })
            .setDescription(
                [
                    `__**BEM-VINDO(A) À ${guildName.toUpperCase()}**__`,
                    'Servidor focado em **segurança**, **automação** e **profissionalismo** — ***ambiente seguro***.',
                    '',
                    '> **Leitura obrigatória:** ao clicar em **✅ Aceito as regras**, você concorda com este documento e com as [Diretrizes](https://discord.com/guidelines) e os [Termos](https://discord.com/terms) do Discord.',
                    '',
                    `**Console:** \`SECURE_MODE=ON\` • \`AUDIT_LOGS=ON\` • **Policy:** \`v2.0\``,
                    `**Atualizado:** <t:${nowUnix}:F> (**<t:${nowUnix}:R>**)`,
                    '',
                    `**Acesso:** pressione **✅ Aceito as regras** para receber ${verifiedRoleMention}.`,
                    `||Se algo parecer suspeito, reporte para ${staffMention}.||`
                ].join('\n')
            )
            .addFields(
                {
                    name: '🧠 01 • Conduta & Convivência',
                    value: [
                        '• **Respeito** acima de tudo (sem ataques, provocações, perseguição ou assédio).',
                        '• Proibido doxxing, exposição de dados, ameaças e chantagem.',
                        '• Evite `ping` em massa; use menções com responsabilidade.',
                        '• ~~"Não li"~~ não é justificativa.'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📦 02 • Conteúdo, Mídia & Spoilers',
                    value: [
                        '- Proibido NSFW, gore e conteúdo de choque.',
                        '- Sem flood de imagens/stickers; mantenha a conversa legível.',
                        '- Use spoiler quando necessário: `||texto||`.'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🛰️ 03 • Spam, Links & Golpes',
                    value: [
                        '- Sem spam/flood, correntes e auto-promo sem permissão.',
                        '- Links suspeitos (encurtadores, "nitro grátis", etc.) serão removidos.',
                        '- Phishing/scam => **ban imediato** + registro em log.'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '🛡️ 04 • Segurança (AutoMod & Logs)',
                    value: [
                        '```ini',
                        '[PROTEÇÕES]',
                        'AutoMod=ON',
                        'Anti-Spam=ON',
                        'Anti-Link=Configurável',
                        'Audit-Logs=ON',
                        '```',
                        `• Burlar filtros/AutoMod => ação imediata (${staffMention}).`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⛔ 05 • Zero Tolerância',
                    value: [
                        '```diff',
                        '- PROIBIDO: palavra \"estupro\" (qualquer contexto)',
                        '+ TOLERÂNCIA: ZERO',
                        '```',
                        'Variações, leetspeak e tentativas de burlar filtros contam como infração.'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '✅ 06 • Verificação (Acesso)',
                    value: [
                        '1) Leia este painel',
                        '2) Clique em **✅ Aceito as regras**',
                        `3) Receba ${verifiedRoleMention} e acesse o servidor`,
                        '||Ao aceitar, você concorda com a aplicação destas regras.||'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '⚖️ 07 • Moderação & Sanções',
                    value: [
                        '> A staff pode agir preventivamente para proteger a comunidade.',
                        '**Escalada (resumo):** `warn` -> `timeout` -> `ban`.',
                        `Dúvidas/recursos: fale com ${supportMention}.`
                    ].join('\n'),
                    inline: false
                }
            )
            .setColor(0x00E5FF)
            .setFooter({ text: `${guildName} • Clique no botão abaixo para verificar` })
            .setTimestamp();

        if (guildIconUrl) {
            embed.setThumbnail(guildIconUrl);
        }

        if (guildBannerUrl) {
            embed.setImage(guildBannerUrl);
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rules_accept')
                .setLabel('Aceito as regras')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Diretrizes')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/guidelines'),
            new ButtonBuilder()
                .setLabel('Termos')
                .setEmoji('📄')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/terms')
        );

        await targetChannel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: `✅ Regras enviadas em ${targetChannel}.` });
    }
};
