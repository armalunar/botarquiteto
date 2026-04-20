const { EmbedBuilder } = require('discord.js');

const Config = require('../utils/configManager');
const Logger = require('../utils/logger');
const AntiRaidSystem = require('../utils/antiRaidSystem');

function getModerationConfig() {
    const config = Config.get('moderation') || {};
    return {
        joinAlertAccountAgeDays: Number(config.joinAlertAccountAgeDays) || 7
    };
}

async function sendSecurityEmbed(guild, embed) {
    const channelId = Config.get('channels.securityLogs') || Config.get('channels.modLogs');
    if (!channelId) {
        return;
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        return;
    }

    await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = async (client, member) => {
    const guild = member.guild;
    const welcomeChannelId = Config.get('channels.welcome');
    const moderationConfig = getModerationConfig();

    const welcomeChannel = welcomeChannelId
        ? guild.channels.cache.get(welcomeChannelId) || await guild.channels.fetch(welcomeChannelId).catch(() => null)
        : null;

    if (welcomeChannel) {
        const embed = new EmbedBuilder()
            .setTitle('👋 Boas-vindas')
            .setColor('#0B1E3A')
            .setDescription(`\`\`\`fix\nPROCESSO DE VERIFICAÇÃO: INICIADO\nSTATUS: OK\n\`\`\`\nSeja bem-vindo(a) ao **${guild.name}**, ${member}. ganhe acesso ao servidor se verificando em <#1494862963318984865>!`)
            .addFields(
                {
                    name: 'Membros',
                    value: String(guild.memberCount),
                    inline: true
                },
                {
                    name: 'Conta criada em',
                    value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`,
                    inline: true
                }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        await welcomeChannel.send({
            content: `Bem-vindo(a), ${member}!`,
            embeds: [embed]
        }).catch(() => {});
    }

    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (24 * 60 * 60 * 1000));
    if (accountAgeDays < moderationConfig.joinAlertAccountAgeDays) {
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Conta recente detectada')
            .setColor('#F39C12')
            .setDescription(`${member} entrou com uma conta potencialmente suspeita.`)
            .addFields(
                {
                    name: 'Usuário',
                    value: `${member.user.tag} (${member.id})`,
                    inline: false
                },
                {
                    name: 'Idade da conta',
                    value: `${accountAgeDays} dia(s)`,
                    inline: true
                },
                {
                    name: 'Entrada',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                }
            )
            .setTimestamp();

        await sendSecurityEmbed(guild, embed);
    }

    try {
        await AntiRaidSystem.handleMemberJoin(client, member);
    } catch (error) {
        Logger.log(`Anti-Raid join handler falhou: ${error.message}`, 'WARN');
    }
};
