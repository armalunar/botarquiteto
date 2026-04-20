const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const Config = require('../utils/configManager');
const Logger = require('../utils/logger');
const TempCache = require('../utils/tempCache');
const TicketSystem = require('../utils/ticketSystem');
const BotconfigState = require('../utils/botconfigState');
const { normalizeRoleIds, isStaffMember } = require('../utils/permissionUtils');
const { buildVerificationOnboardingPayload, getProfileConfig } = require('../utils/verificationOnboardingUi');

const getPanel = (name) => {
    const fileName = name.endsWith('Panel') ? name : `${name}Panel`;
    return require(`../panels/botconfig/${fileName}`);
};

module.exports = async (client, interaction) => {
    const id = interaction.customId;

    try {
        if (id === 'automod_toggle_select') {
            const action = interaction.values[0];
            
            if (action === 'toggle_antilink') {
                const current = Config.get('automod.antiLink') || false;
                Config.set('automod.antiLink', !current);
            } else if (action === 'toggle_antispam') {
                const current = Config.get('automod.antiSpam') || false;
                Config.set('automod.antiSpam', !current);
            } else if (action === 'toggle_antiflood') {
                const current = Config.get('automod.antiFlood') || false;
                Config.set('automod.antiFlood', !current);
            } else if (action === 'toggle_capslock') {
                const current = Config.get('automod.capsLock') || false;
                Config.set('automod.capsLock', !current);
            } else if (action === 'toggle_mentionspam') {
                const current = Config.get('automod.mentionSpam') || false;
                Config.set('automod.mentionSpam', !current);
            }
            
            await interaction.deferUpdate();
            return getPanel('automod')(interaction);
        }

        if (id === 'automod_words_action') {
            const action = interaction.values[0];
            
            if (action === 'add_word') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_automod_addword')
                    .setTitle('Adicionar Termos Proibidos');
                
                const input = new TextInputBuilder()
                    .setCustomId('words_input')
                    .setLabel('Palavras (separadas por vírgula)')
                    .setPlaceholder('palavra1, palavra2, palavra3')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            
            if (action === 'remove_word') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_automod_removeword')
                    .setTitle('Remover Termo');
                
                const input = new TextInputBuilder()
                    .setCustomId('word_remove_input')
                    .setLabel('Palavra a remover')
                    .setPlaceholder('Digite exatamente a palavra')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            
            if (action === 'list_words') {
                const mandatoryWords = ['estupro'];
                const configuredWords = Config.get('automod.badWords') || [];
                const badWords = Array.from(new Set([
                    ...mandatoryWords,
                    ...configuredWords.map(word => String(word || '').trim().toLowerCase()).filter(Boolean)
                ]));

                const list = badWords.length > 0
                    ? badWords.map((word, index) => `${index + 1}. \`${word}\``).join('\n')
                    : 'Nenhum termo cadastrado.';
                
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📜 Lista de Termos Proibidos')
                            .setDescription(list.substring(0, 4000))
                            .setColor('#5865F2')
                    ],
                    ephemeral: true
                });
                return;
            }
            
            if (action === 'clear_words') {
                Config.set('automod.badWords', []);
                await interaction.deferUpdate();
                return getPanel('automod')(interaction);
            }
        }

        if (id === 'antiraid_toggle_actions') {
            const action = String(interaction.values?.[0] || '');

            if (action === 'toggle_enabled') {
                const current = Config.get('moderation.antiRaid.enabled') || false;
                Config.set('moderation.antiRaid.enabled', !current);
            } else if (action === 'toggle_gate') {
                const current = Config.get('moderation.antiRaid.blockUnverifiedMessages') !== false;
                Config.set('moderation.antiRaid.blockUnverifiedMessages', !current);
            } else if (action === 'toggle_dm_on_join') {
                const current = Config.get('moderation.antiRaid.dmOnRaidJoin') || false;
                Config.set('moderation.antiRaid.dmOnRaidJoin', !current);
            } else if (action === 'clear_quarantine') {
                Config.set('moderation.antiRaid.quarantineRoleId', '');
            }

            await interaction.deferUpdate();
            return getPanel('security')(interaction);
        }

        if (id === 'antiraid_value_actions') {
            const action = String(interaction.values?.[0] || '');

            const setNumber = (key, value) => {
                if (!Number.isFinite(Number(value))) return;
                Config.set(key, Number(value));
            };

            if (action === 'threshold_custom') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_antiraid_threshold_custom')
                    .setTitle('Anti-Raid • Definir limite');

                const input = new TextInputBuilder()
                    .setCustomId('threshold')
                    .setLabel('Entradas para disparar (2-100)')
                    .setPlaceholder('Ex: 8')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(3);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }

            if (action.startsWith('threshold_')) {
                const value = parseInt(action.split('_')[1], 10);
                if (Number.isInteger(value)) setNumber('moderation.antiRaid.joinThreshold', value);
            } else if (action.startsWith('window_')) {
                const seconds = parseInt(action.split('_')[1], 10);
                if (Number.isInteger(seconds)) setNumber('moderation.antiRaid.joinWindowMs', seconds * 1000);
            } else if (action.startsWith('duration_')) {
                const minutes = parseInt(action.split('_')[1], 10);
                if (Number.isInteger(minutes)) setNumber('moderation.antiRaid.raidModeDurationMs', minutes * 60 * 1000);
            } else if (action.startsWith('cooldown_')) {
                const seconds = parseInt(action.split('_')[1], 10);
                if (Number.isInteger(seconds)) setNumber('moderation.antiRaid.alertCooldownMs', seconds * 1000);
            }

            await interaction.deferUpdate();
            return getPanel('security')(interaction);
        }

        if (id === 'verification_games_action') {
            const action = String(interaction.values?.[0] || '');
            BotconfigState.set(interaction.user.id, { verificationGamesAction: action });

            if (action === 'add_game') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_verification_game_add')
                    .setTitle('Adicionar jogo');

                const labelInput = new TextInputBuilder()
                    .setCustomId('game_label')
                    .setLabel('Nome do jogo')
                    .setPlaceholder('Ex: Valorant')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50);

                const emojiInput = new TextInputBuilder()
                    .setCustomId('game_emoji')
                    .setLabel('Emoji (opcional)')
                    .setPlaceholder('Ex: 🎯 ou <:nome:id>')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(64);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(labelInput),
                    new ActionRowBuilder().addComponents(emojiInput)
                );

                return interaction.showModal(modal);
            }

            await interaction.deferUpdate();
            return getPanel('verification')(interaction);
        }

        if (id === 'verification_games_target') {
            const key = String(interaction.values?.[0] || '').trim();
            const state = BotconfigState.set(interaction.user.id, { verificationGameKey: key });

            if (state.verificationGamesAction === 'remove_game' && key) {
                const verification = Config.get('verification') || {};
                const games = Array.isArray(verification.gameRoles) ? verification.gameRoles : [];
                const next = games.filter(entry => String(entry?.key || '').trim() !== key);
                Config.set('verification.gameRoles', next);
                BotconfigState.set(interaction.user.id, { verificationGameKey: '' });
            }

            await interaction.deferUpdate();
            return getPanel('verification')(interaction);
        }

        if (id === 'verify_profile_notify') {
            await interaction.deferUpdate();

            if (!interaction.inGuild?.()) {
                return;
            }

            const member = interaction.member;
            const choice = String(interaction.values?.[0] || '').toLowerCase();
            const notifyRoleId = String(Config.get('verification.notifyRoleId') || '').trim();

            if (!notifyRoleId) {
                const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
                payload.content = '⚠️ Cargo de notificações não está configurado pela staff.';
                await interaction.editReply(payload).catch(() => {});
                return;
            }

            try {
                if (choice === 'on') {
                    await member.roles.add(notifyRoleId, 'Onboarding: opt-in de notificações.');
                } else if (choice === 'off') {
                    await member.roles.remove(notifyRoleId, 'Onboarding: opt-out de notificações.');
                }
            } catch (error) {
                const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
                payload.content = '❌ Não consegui atualizar seu cargo de notificações. Verifique se eu tenho permissão de `Gerenciar Cargos`.';
                await interaction.editReply(payload).catch(() => {});
                return;
            }

            const refreshed = await interaction.guild.members.fetch(member.id).catch(() => member);
            const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member: refreshed });
            payload.content = '✅ Preferência de notificações atualizada.';
            await interaction.editReply(payload).catch(() => {});
            return;
        }

        if (id === 'verify_profile_games') {
            await interaction.deferUpdate();

            if (!interaction.inGuild?.()) {
                return;
            }

            const member = interaction.member;
            const selectedKeys = Array.isArray(interaction.values) ? interaction.values.map(v => String(v)) : [];
            const selectedSet = new Set(selectedKeys);
            const { games } = getProfileConfig();

            if (!games.length) {
                const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
                payload.content = '⚠️ Nenhum jogo foi configurado pela staff.';
                await interaction.editReply(payload).catch(() => {});
                return;
            }

            const roleIds = games
                .map(entry => ({ key: entry.key, roleId: String(entry.roleId || '').trim() }))
                .filter(entry => /^\d{17,20}$/.test(entry.roleId));

            const toAdd = roleIds.filter(entry => selectedSet.has(entry.key)).map(entry => entry.roleId);
            const toRemove = roleIds.filter(entry => !selectedSet.has(entry.key)).map(entry => entry.roleId);

            try {
                if (toAdd.length) {
                    await member.roles.add(toAdd, 'Onboarding: cargos de jogos (add).');
                }
                if (toRemove.length) {
                    await member.roles.remove(toRemove, 'Onboarding: cargos de jogos (remove).');
                }
            } catch (error) {
                const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
                payload.content = '❌ Não consegui atualizar seus cargos de jogos. Verifique permissões e hierarquia de cargos.';
                await interaction.editReply(payload).catch(() => {});
                return;
            }

            const refreshed = await interaction.guild.members.fetch(member.id).catch(() => member);
            const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member: refreshed });
            payload.content = '✅ Preferências de jogos atualizadas.';
            await interaction.editReply(payload).catch(() => {});
            return;
        }

        if (interaction.isUserSelectMenu() && id === 'select_verify_invite_user') {
            const inviterId = interaction.values[0];
            TempCache.set(interaction.user.id, { inviteSource: inviterId });
            
            const modal = new ModalBuilder().setCustomId('modal_lol_verify').setTitle('Conectar Riot ID');
            const nick = new TextInputBuilder().setCustomId('nick').setLabel('Seu Nick').setStyle(TextInputStyle.Short).setRequired(true);
            const tag = new TextInputBuilder().setCustomId('tag').setLabel('Sua Tag').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nick), new ActionRowBuilder().addComponents(tag));
            
            await interaction.showModal(modal);
            return;
        }

        if (interaction.isChannelSelectMenu()) {
            const map = {
                'select_channel_general': 'channels.generalLogs',
                'select_channel_mod': 'channels.modLogs',
                'select_channel_verify': 'channels.verifyLogs',
                'select_channel_security': 'channels.securityLogs',
                'select_channel_welcome': 'channels.welcome',
                'select_channel_ticket_logs': 'tickets.logsChannelId',
                'select_channel_ticket_category': 'tickets.categoryId'
            };
            if (map[id]) {
                Config.set(map[id], interaction.values[0]);
                await interaction.deferUpdate();
                if (id.includes('ticket')) return getPanel('tickets')(interaction);
                return getPanel('channels')(interaction); 
            }
        }

        if (id === 'roles_target_select') {
            const target = interaction.values?.[0] || 'staff';
            BotconfigState.set(interaction.user.id, { rolesTarget: target });
            await interaction.deferUpdate();
            return getPanel('roles')(interaction);
        }

        if (interaction.isRoleSelectMenu()) {
            if (id.startsWith('config_verify_game_role:')) {
                const key = String(id.split(':')[1] || '').trim();
                const roleId = String(interaction.values?.[0] || '').trim();

                if (key && roleId) {
                    const verification = Config.get('verification') || {};
                    const games = Array.isArray(verification.gameRoles) ? verification.gameRoles : [];
                    const next = games.map(entry => {
                        if (String(entry?.key || '').trim() !== key) return entry;
                        return { ...entry, roleId };
                    });
                    Config.set('verification.gameRoles', next);
                    BotconfigState.set(interaction.user.id, { verificationGameKey: key, verificationGamesAction: 'set_role' });
                }

                await interaction.deferUpdate();
                return getPanel('verification')(interaction);
            }

            const map = { 
                'config_verify_role': 'roles.verified', 
                'config_verify_notify_role': 'verification.notifyRoleId',
                'config_role_staff': 'roles.staff', 
                'config_role_muted': 'roles.muted', 
                'config_role_trusted': 'roles.trusted',
                'config_role_autorole': 'roles.autorole',
                'config_role_ticket_support': 'tickets.supportRoleId',
                'config_antiraid_quarantine_role': 'moderation.antiRaid.quarantineRoleId'
            };
            if (map[id]) {
                if (id === 'config_role_staff') {
                    Config.set(map[id], interaction.values);
                } else {
                    Config.set(map[id], interaction.values[0] || '');
                }
                await interaction.deferUpdate();
                if (id.includes('ticket')) return getPanel('tickets')(interaction);
                if (id.includes('antiraid')) return getPanel('security')(interaction);
                if (id.includes('verify_notify')) return getPanel('verification')(interaction);
                return getPanel('roles')(interaction);
            }
        }

        if (id === 'ticket_history_select') {
            await interaction.deferReply({ ephemeral: true });
            const ticketId = interaction.values[0];
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Apenas a staff pode baixar transcrições.' });
            }

            const transcript = TicketSystem.getTranscriptFile(ticketId);
            if (!transcript) {
                return interaction.editReply({ content: '❌ Transcrição não encontrada no armazenamento.' });
            }

            const file = new AttachmentBuilder(transcript.buffer, { name: transcript.fileName });
            await interaction.editReply({
                content: `✅ Transcrição gerada para **${ticketId}**.`,
                files: [file]
            });
            return;
        }

        if (id === 'ticket_staff_priority') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode alterar prioridade.', ephemeral: true });
            }

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
            }

            const value = String(interaction.values?.[0] || '').toLowerCase();
            const allowed = new Set(['low', 'normal', 'high', 'urgent']);
            if (!allowed.has(value)) {
                return interaction.reply({ content: '❌ Prioridade inválida.', ephemeral: true });
            }

            ticket.priority = value;
            TicketSystem.activeTickets.set(interaction.channelId, ticket);
            TicketSystem.persistActiveTickets();

            await interaction.deferUpdate();
            await TicketSystem.refreshTicket(interaction.channel);
            return;
        }

        if (id === 'ticket_staff_stage') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode alterar a etapa.', ephemeral: true });
            }

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
            }

            const value = String(interaction.values?.[0] || '').toLowerCase();
            const allowed = new Set(['new', 'in_progress', 'waiting_user']);
            if (!allowed.has(value)) {
                return interaction.reply({ content: '❌ Etapa inválida.', ephemeral: true });
            }

            ticket.stage = value;
            TicketSystem.activeTickets.set(interaction.channelId, ticket);
            TicketSystem.persistActiveTickets();

            await interaction.deferUpdate();
            await TicketSystem.refreshTicket(interaction.channel);
            return;
        }

        if (id === 'ticket_admin_options') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Acesso negado. Apenas a staff pode executar ações administrativas.', ephemeral: true });
            }

            const action = interaction.values[0];
            const ticket = TicketSystem.activeTickets.get(interaction.channelId);

            if (action === 'admin_add_user') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_admin_add').setTitle('Adicionar membro');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setPlaceholder('Ex: 123456789...').setStyle(TextInputStyle.Short).setRequired(true)));
                return interaction.showModal(modal);
            }
            if (action === 'admin_remove_user') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_admin_remove').setTitle('Remover membro');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID do usuário').setPlaceholder('Ex: 123456789...').setStyle(TextInputStyle.Short).setRequired(true)));
                return interaction.showModal(modal);
            }
            if (action === 'admin_ban_user') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_admin_ban').setTitle('Banir usuário');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('user_id')
                            .setLabel('ID ou menção do usuário')
                            .setPlaceholder('Ex: 123456789... ou <@123...>')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('reason')
                            .setLabel('Motivo (opcional)')
                            .setPlaceholder('Ex: Violação das regras do servidor')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setMaxLength(800)
                    )
                );
                return interaction.showModal(modal);
            }
            if (action === 'admin_logs') {
                await interaction.deferReply({ ephemeral: true });
                const transcript = await TicketSystem.generateTranscript(interaction.channel, ticket);
                if (!transcript) return interaction.editReply({ content: '❌ Falha ao gerar transcrição.' });

                const fileName = `transcript-${ticket?.ticketId || interaction.channel.name}.html`;
                const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: fileName });
                await interaction.editReply({ content: '✅ Transcrição gerada.', files: [file] });
                return;
            }
            if (action === 'admin_close') {
                const buttons = [
                    new ButtonBuilder()
                        .setCustomId('ticket_confirm_close_resolved')
                        .setLabel('Encerrar (resolvido)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_confirm_close_unresolved')
                        .setLabel('Encerrar (não resolvido)')
                        .setStyle(ButtonStyle.Danger)
                ];

                if (ticketConfig.closeConfirmation) {
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId('ticket_cancel_close')
                            .setLabel('Cancelar')
                            .setStyle(ButtonStyle.Secondary)
                    );
                }

                const row = new ActionRowBuilder().addComponents(...buttons);
                await interaction.reply({ content: 'Encerrar ticket. Informe o resultado do atendimento:', components: [row], ephemeral: true });
                return;
            }
        }

        if (id === 'ticket_config_options') {
            const action = interaction.values[0];

            if (action === 'toggle_intake' || action === 'toggle_ai') {
                const current = Config.get('tickets.intake.enabled') !== false;
                Config.set('tickets.intake.enabled', !current);
                await interaction.deferUpdate();
                return getPanel('tickets')(interaction);
            }

            if (action === 'toggle_intake_welcome' || action === 'toggle_ai_welcome') {
                const current = Config.get('tickets.intake.autoWelcome') !== false;
                Config.set('tickets.intake.autoWelcome', !current);
                await interaction.deferUpdate();
                return getPanel('tickets')(interaction);
            }

            if (action === 'toggle_intake_disclaimer' || action === 'toggle_ai_disclaimer') {
                const current = Config.get('tickets.intake.includeDisclaimer') !== false;
                Config.set('tickets.intake.includeDisclaimer', !current);
                await interaction.deferUpdate();
                return getPanel('tickets')(interaction);
            }

            if (action === 'set_ai_model') {
                await interaction.reply({ content: '⚠️ Configuração de modelo removida (pré-atendimento não usa IA externa).', ephemeral: true });
                return;
            }

            if (action === 'view_history') {
                const history = TicketSystem.loadTicketHistory().slice(0, 25);
                if (history.length === 0) {
                    return interaction.reply({ content: '📭 Nenhuma transcrição encontrada no histórico.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📄 Transcrições de tickets')
                    .setDescription('Selecione um ticket para baixar a transcrição (HTML).')
                    .setColor('#5865F2')
                    .setFooter({ text: 'Toxic 2.0' });

                const select = new StringSelectMenuBuilder()
                    .setCustomId('ticket_history_select')
                    .setPlaceholder('Selecione um ticket')
                    .addOptions(history.map(entry => ({
                        label: `${entry.ticketId} • ${entry.userTag || 'usuário'}`.slice(0, 100),
                        description: `Encerrado: ${entry.closedAt ? new Date(entry.closedAt).toLocaleString('pt-BR') : 'N/A'} | Motivo: ${String(entry.reason || '').slice(0, 50)}`.slice(0, 100),
                        value: entry.ticketId
                    })));

                const row = new ActionRowBuilder().addComponents(select);
                return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }

            if (action === 'search_ticket') {
                const modal = new ModalBuilder().setCustomId('modal_ticket_history_search').setTitle('Buscar transcrição');
                const input = new TextInputBuilder()
                    .setCustomId('ticket_id')
                    .setLabel('ID do ticket (ex: T2-00001)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('T2-00001')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            
            if (action.startsWith('max_')) {
                const maxVal = parseInt(action.split('_')[1]);
                Config.set('tickets.maxTicketsPerUser', maxVal);
            } else if (action === 'toggle_confirmation') {
                const current = Config.get('tickets.closeConfirmation') !== false;
                Config.set('tickets.closeConfirmation', !current);
            } else if (action === 'reset_counter') {
                Config.set('tickets.counter', 0);
            }
            
            await interaction.deferUpdate();
            return getPanel('tickets')(interaction);
        }

        if (id === 'select_embed_type') {
            await interaction.deferUpdate();
            return getPanel('embeds')(interaction);
        }

        if (id.startsWith('select_embed_action:')) {
            const embedKey = id.split(':')[1];
            const action = interaction.values[0];
            const currentData = Config.get(`embeds.${embedKey}`) || {};
            let modal;
            
            if (action === 'edit_content') {
                modal = new ModalBuilder().setCustomId(`modal_embed_save:${embedKey}:content`).setTitle('Editar Conteúdo');
                const t = new TextInputBuilder().setCustomId('title').setLabel('Título').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.title || '');
                const d = new TextInputBuilder().setCustomId('description').setLabel('Descrição').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(currentData.description || '');
                modal.addComponents(new ActionRowBuilder().addComponents(t), new ActionRowBuilder().addComponents(d));
            } 
            else if (action === 'edit_visual') {
                modal = new ModalBuilder().setCustomId(`modal_embed_save:${embedKey}:visual`).setTitle('Editar Visual');
                const c = new TextInputBuilder().setCustomId('color').setLabel('Cor').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.color || '');
                const i = new TextInputBuilder().setCustomId('image').setLabel('Imagem').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.image || '');
                const th = new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumb').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.thumbnail || '');
                modal.addComponents(new ActionRowBuilder().addComponents(c), new ActionRowBuilder().addComponents(i), new ActionRowBuilder().addComponents(th));
            }
            else if (action === 'edit_extra') {
                modal = new ModalBuilder().setCustomId(`modal_embed_save:${embedKey}:extra`).setTitle('Editar Extras');
                const f = new TextInputBuilder().setCustomId('footer').setLabel('Rodapé').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.footer || '');
                const a = new TextInputBuilder().setCustomId('author').setLabel('Autor').setStyle(TextInputStyle.Short).setRequired(false).setValue(currentData.author || '');
                modal.addComponents(new ActionRowBuilder().addComponents(f), new ActionRowBuilder().addComponents(a));
            }
            
            if(modal) await interaction.showModal(modal);
            return;
        }

    } catch (error) {
        Logger.log(`Erro SelectHandler: ${error.message}`, 'ERROR');
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erro interno.', ephemeral: true });
    }
};
