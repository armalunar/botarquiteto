const { EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Config = require('../../utils/configManager');
const { StringSelectMenuBuilder } = require('discord.js');
const BotconfigState = require('../../utils/botconfigState');
const { normalizeRoleIds } = require('../../utils/permissionUtils');

function clampText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function formatRoleList(roleIds) {
    if (!roleIds.length) {
        return '`Não definido`';
    }

    const mentionText = roleIds.map(id => `<@&${id}>`).join(', ');
    return clampText(mentionText, 1024);
}

function targetFromInteraction(interaction) {
    const id = interaction?.customId || '';

    if (id === 'config_role_staff') return 'staff';
    if (id === 'config_verify_role') return 'verified';
    if (id === 'config_role_muted') return 'muted';
    if (id === 'config_role_trusted') return 'trusted';

    return null;
}

module.exports = async (interaction, { target: forcedTarget } = {}) => {
    const roles = Config.get('roles') || {};
    const staffRoleIds = normalizeRoleIds(roles.staff);

    const guildName = interaction.guild?.name || 'Servidor';
    const guildIconUrl = interaction.guild?.iconURL?.({ size: 256 }) || null;

    const state = BotconfigState.get(interaction.user.id);
    const inferredTarget = targetFromInteraction(interaction);
    const target = forcedTarget || inferredTarget || state.rolesTarget || 'staff';
    BotconfigState.set(interaction.user.id, { rolesTarget: target });

    const verifiedConfigured = Boolean(roles.verified);
    const staffConfigured = staffRoleIds.length > 0;

    const embed = new EmbedBuilder()
        .setTitle('👑 BotConfig • Cargos & Permissões')
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setDescription(
            [
                '**Cargos controlam acesso, automações e segurança.**',
                'Selecione um tipo abaixo e ajuste usando o seletor.',
                '',
                '🤖 **IA:** use o botão para **criar ou encontrar** um cargo automaticamente caso não exista.'
            ].join('\n')
        )
        .addFields(
            { name: '🧑‍⚖️ Staff/Admin (multi)', value: formatRoleList(staffRoleIds), inline: false },
            { name: '✅ Verificado', value: roles.verified ? `<@&${roles.verified}>` : '`Não definido`', inline: true },
            { name: '🔇 Muted', value: roles.muted ? `<@&${roles.muted}>` : '`Não definido`', inline: true },
            { name: '🤝 Trusted', value: roles.trusted ? `<@&${roles.trusted}>` : '`Não definido`', inline: true },
            {
                name: '🧭 Status',
                value: [
                    staffConfigured ? '✅ Staff/Admin configurado' : '⚠️ Staff/Admin não configurado',
                    verifiedConfigured ? '✅ Verificado configurado (regras)' : '⚠️ Verificado não configurado (regras)'
                ].join('\n'),
                inline: false
            }
        )
        .setColor(0x00E5FF)
        .setFooter({ text: 'Toxic 2.0 • Cargos configuráveis via /botconfig' });

    if (guildIconUrl) {
        embed.setThumbnail(guildIconUrl);
    }

    const targetMenu = new StringSelectMenuBuilder()
        .setCustomId('roles_target_select')
        .setPlaceholder('Selecione o tipo de cargo para configurar')
        .addOptions([
            { label: 'Staff/Admin', value: 'staff', description: 'Cargos com acesso administrativo (multi)', emoji: '🧑‍⚖️', default: target === 'staff' },
            { label: 'Verificado', value: 'verified', description: 'Cargo dado ao aceitar as regras', emoji: '✅', default: target === 'verified' },
            { label: 'Muted', value: 'muted', description: 'Cargo usado para silenciar/punições', emoji: '🔇', default: target === 'muted' },
            { label: 'Trusted', value: 'trusted', description: 'Bypass/exceções do AutoMod', emoji: '🤝', default: target === 'trusted' }
        ]);

    let roleSelect;
    if (target === 'staff') {
        roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('config_role_staff')
            .setPlaceholder('Selecione 1+ cargos de Staff/Admin')
            .setMaxValues(10);
    } else if (target === 'verified') {
        roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('config_verify_role')
            .setPlaceholder('Selecione o cargo de Verificado')
            .setMaxValues(1);
    } else if (target === 'muted') {
        roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('config_role_muted')
            .setPlaceholder('Selecione o cargo Muted')
            .setMaxValues(1);
    } else {
        roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('config_role_trusted')
            .setPlaceholder('Selecione o cargo Trusted')
            .setMaxValues(1);
    }

    if (target === 'staff' && staffRoleIds.length) {
        roleSelect.setDefaultRoles(staffRoleIds.slice(0, 10));
    } else if (target === 'verified' && roles.verified) {
        roleSelect.setDefaultRoles([roles.verified]);
    } else if (target === 'muted' && roles.muted) {
        roleSelect.setDefaultRoles([roles.muted]);
    } else if (target === 'trusted' && roles.trusted) {
        roleSelect.setDefaultRoles([roles.trusted]);
    }

    const rowTarget = new ActionRowBuilder().addComponents(targetMenu);
    const rowRole = new ActionRowBuilder().addComponents(roleSelect);

    const btnAi = new ButtonBuilder()
        .setCustomId(`botconfig_role_ai_create:${target}`)
        .setLabel('IA: Criar/Achar')
        .setEmoji('🤖')
        .setStyle(ButtonStyle.Primary);

    const btnClear = new ButtonBuilder()
        .setCustomId(`botconfig_role_clear:${target}`)
        .setLabel('Limpar')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary);

    const rowActions = new ActionRowBuilder().addComponents(btnAi, btnClear);

    const backBtn = new ButtonBuilder()
        .setCustomId('botconfig_home')
        .setLabel('Voltar')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary);

    const rowBack = new ActionRowBuilder().addComponents(backBtn);

    const payload = { content: '', embeds: [embed], components: [rowTarget, rowRole, rowActions, rowBack] };

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
