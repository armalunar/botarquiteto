const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Logger = require('../utils/logger');
const Config = require('../utils/configManager');
const BotconfigState = require('../utils/botconfigState');
const fs = require('fs');
const path = require('path');

// Mapa de imports lazy dos painéis
const panels = {
    'main': require('../panels/botconfig/mainPanel'),
    'channels': require('../panels/botconfig/channelsPanel'),
    'roles': require('../panels/botconfig/rolesPanel'),
    'security': require('../panels/botconfig/securityPanel'),
    'verification': require('../panels/botconfig/verificationPanel'),
    'automod': require('../panels/botconfig/automodPanel'),
    'advanced': require('../panels/botconfig/advancedPanel'),
    'tickets': require('../panels/botconfig/ticketsPanel')
};

module.exports = async (client, interaction) => {
    const id = interaction.customId;
    const projectConfigPath = path.join(__dirname, '../../data/config.json');

    try {
        // Navegação Básica
        if (id === 'botconfig_home') return await panels.main(interaction);
        if (id === 'botconfig_close') return await interaction.deleteReply();

        if (id.startsWith('botconfig_role_clear:')) {
            const target = String(id.split(':')[1] || '').trim();
            const keyMap = {
                'verified': 'roles.verified',
                'muted': 'roles.muted',
                'trusted': 'roles.trusted'
            };

            try {
                if (target === 'staff') {
                    Config.set('roles.staff', []);
                } else if (keyMap[target]) {
                    Config.set(keyMap[target], '');
                }
            } catch (error) {
                Logger.log(`Erro ao limpar cargo (${target}): ${error.message}`, 'ERROR');
            }

            BotconfigState.set(interaction.user.id, { rolesTarget: target || 'staff' });
            await interaction.deferUpdate();
            return await panels.roles(interaction, { target: target || 'staff' });
        }

        if (id.startsWith('botconfig_role_ai_create:')) {
            const target = String(id.split(':')[1] || '').trim() || 'staff';
            BotconfigState.set(interaction.user.id, { rolesTarget: target });

            const templates = {
                staff: { label: 'Staff/Admin', name: 'Staff', color: '#ED4245' },
                verified: { label: 'Verificado', name: 'Verificado', color: '#00E5FF' },
                muted: { label: 'Muted', name: 'Muted', color: '#80848E' },
                trusted: { label: 'Trusted', name: 'Trusted', color: '#57F287' }
            };

            const template = templates[target] || templates.staff;

            const modal = new ModalBuilder()
                .setCustomId(`modal_botconfig_role_ai_create:${target}`)
                .setTitle(`IA • Criar/Achar cargo (${template.label})`);

            const nameInput = new TextInputBuilder()
                .setCustomId('role_name')
                .setLabel('Nome do cargo (opcional)')
                .setPlaceholder(`Ex: ${template.name}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(100);

            const colorInput = new TextInputBuilder()
                .setCustomId('role_color')
                .setLabel('Cor HEX (opcional)')
                .setPlaceholder(`Ex: ${template.color}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(10);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(colorInput)
            );

            return await interaction.showModal(modal);
        }

        // ====================================================
        // SISTEMA: BACKUP (Baixar config.json)
        // ====================================================
        if (id === 'botconfig_sys_backup') {
            await interaction.deferReply({ ephemeral: true });
            try {
                if (fs.existsSync(projectConfigPath)) {
                    const fileBuffer = fs.readFileSync(projectConfigPath);
                    const attachment = new AttachmentBuilder(fileBuffer, { name: `toxic2_config_backup_${Date.now()}.json` });
                    await interaction.editReply({ 
                        content: '✅ Backup gerado. Guarde este arquivo em segurança.', 
                        files: [attachment] 
                    });
                } else {
                    await interaction.editReply({ content: '❌ Arquivo de configuração não encontrado.' });
                }
            } catch (error) {
                Logger.log(`Erro Backup: ${error.message}`, 'ERROR');
                await interaction.editReply({ content: `❌ Erro ao ler arquivo: ${error.message}` });
            }
            return;
        }

        // ====================================================
        // SISTEMA: RESET (Apagar config.json e recriar defaults)
        // ====================================================
        if (id === 'botconfig_sys_reset') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('botconfig_sys_reset_confirm')
                    .setLabel('Confirmar reset')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('botconfig_sys_reset_cancel')
                    .setLabel('Cancelar')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                content: '⚠️ Isso vai resetar `data/config.json` para os padrões do Toxic 2.0. Deseja continuar?',
                components: [row],
                ephemeral: true
            });
            return;
        }

        if (id === 'botconfig_sys_reset_cancel') {
            await interaction.update({ content: '✅ Reset cancelado.', components: [] });
            return;
        }

        if (id === 'botconfig_sys_reset_confirm') {
            await interaction.update({ content: '🧹 Resetando configuração...', components: [] });

            try {
                if (fs.existsSync(projectConfigPath)) {
                    fs.unlinkSync(projectConfigPath);
                }
                Config.load();
            } catch (error) {
                Logger.log(`Erro Reset: ${error.message}`, 'ERROR');
                await interaction.followUp({ content: `❌ Falha ao resetar: ${error.message}`, ephemeral: true }).catch(() => {});
                return;
            }

            await interaction.followUp({ content: '✅ Configuração resetada para os padrões.', ephemeral: true }).catch(() => {});
            return;
        }

        // ====================================================
        // SISTEMA: RELOAD (Recarregar Comandos)
        // ====================================================
        if (id === 'botconfig_sys_reload') {
            await interaction.deferReply({ ephemeral: true });
            try {
                const commandsPath = path.join(__dirname, '../commands');
                const clearCache = (dir) => {
                    if (!fs.existsSync(dir)) return;
                    fs.readdirSync(dir).forEach(file => {
                        const fullPath = path.join(dir, file);
                        if (fs.lstatSync(fullPath).isDirectory()) {
                            clearCache(fullPath);
                        } else {
                            try {
                                delete require.cache[require.resolve(fullPath)];
                            } catch(e){}
                        }
                    });
                };
                clearCache(commandsPath);
                try { await require('../handlers/commandHandler')(client); } catch(e){}
                await interaction.editReply('✅ Comandos recarregados.');
            } catch (error) {
                await interaction.editReply(`❌ Falha no Reload: ${error.message}`);
            }
            return;
        }

        // ====================================================
        // NAVEGAÇÃO DO MENU PRINCIPAL
        // ====================================================
        if (id === 'botconfig_menu_select') {
            const selected = interaction.values[0];

            if (selected === 'config_bot') {
                const modal = new ModalBuilder().setCustomId('modal_bot_config').setTitle('Configuração do bot');
                const iName = new TextInputBuilder().setCustomId('bot_name').setLabel('Username').setValue(client.user.username).setStyle(TextInputStyle.Short).setRequired(false);
                const iNick = new TextInputBuilder().setCustomId('bot_nick').setLabel('Apelido').setValue(interaction.guild.members.me.nickname || '').setStyle(TextInputStyle.Short).setRequired(false);
                const iAv = new TextInputBuilder().setCustomId('bot_avatar').setLabel('Avatar URL').setStyle(TextInputStyle.Short).setRequired(false);
                const iSt = new TextInputBuilder()
                    .setCustomId('bot_status')
                    .setLabel('Status (online/idle/dnd/invisible)')
                    .setPlaceholder('Ex: online')
                    .setValue(Config.get('bot.status') || 'online')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const iAct = new TextInputBuilder()
                    .setCustomId('bot_activity')
                    .setLabel('Atividade (opcional)')
                    .setPlaceholder('Ex: playing: Gerenciando a comunidade')
                    .setValue(Config.get('bot.activityText') || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(new ActionRowBuilder().addComponents(iName), new ActionRowBuilder().addComponents(iNick), new ActionRowBuilder().addComponents(iAv), new ActionRowBuilder().addComponents(iSt), new ActionRowBuilder().addComponents(iAct));
                return await interaction.showModal(modal);
            }

            const map = {
                'config_channels': 'channels',
                'config_roles': 'roles',
                'config_security': 'security',
                'config_verification': 'verification',
                'config_automod': 'automod',
                'config_advanced': 'advanced',
                'config_tickets': 'tickets'
            };
            
            if (map[selected]) return await panels[map[selected]](interaction);
        }

    } catch (error) {
        Logger.log(`Erro PanelHandler: ${error.message}`, 'ERROR');
        if (!interaction.replied && !interaction.deferred) {
             await interaction.reply({ content: '❌ Erro interno no painel.', ephemeral: true }).catch(()=>{});
        } else {
             await interaction.editReply({ content: '❌ Erro ao processar ação do painel.', embeds: [], components: [] }).catch(()=>{});
        }
    }
};
