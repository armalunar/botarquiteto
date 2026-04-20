const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const TicketSystem = require('../utils/ticketSystem');
const Config = require('../utils/configManager');
const TicketIntakeAssistant = require('../utils/ticketIntakeAssistant');
const { buildVerificationOnboardingPayload } = require('../utils/verificationOnboardingUi');
const { AttachmentBuilder } = require('discord.js');
const { normalizeRoleIds, isStaffMember } = require('../utils/permissionUtils');

module.exports = async (client, interaction) => {
    if (!interaction.isButton()) return false;
    
    try {
        const id = interaction.customId;
        const userId = interaction.user.id;

        if (id === 'rules_accept') {
            if (!interaction.inGuild?.()) {
                await interaction.reply({ content: '❌ Este botão só funciona dentro do servidor.', ephemeral: true }).catch(() => {});
                return true;
            }

            const verifiedRoleId = Config.get('roles.verified');
            if (!verifiedRoleId) {
                await interaction.reply({ content: '⚠️ Cargo de verificado não configurado. Use `/botconfig` → Cargos.', ephemeral: true }).catch(() => {});
                return true;
            }

            const member = interaction.member;
            if (!member?.roles?.add) {
                await interaction.reply({ content: '❌ Não consegui acessar seus dados de membro no servidor.', ephemeral: true }).catch(() => {});
                return true;
            }

            if (member.roles.cache?.has?.(verifiedRoleId)) {
                await interaction.reply({ content: '✅ Você já está verificado.', ephemeral: true }).catch(() => {});
                return true;
            }

            try {
                await member.roles.add(verifiedRoleId, 'Aceitou as regras do servidor.');
            } catch (error) {
                await interaction.reply({
                    content: '❌ Não consegui te verificar. Verifique se eu tenho permissão de `Gerenciar Cargos` e se meu cargo está acima do cargo de verificado.',
                    ephemeral: true
                }).catch(() => {});
                return true;
            }

            const quarantineRoleId = String(Config.get('moderation.antiRaid.quarantineRoleId') || '').trim();
            if (quarantineRoleId && member.roles.cache?.has?.(quarantineRoleId)) {
                await member.roles.remove(quarantineRoleId, 'Verificação concluída: removendo quarentena Anti-Raid.').catch(() => {});
            }

            const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
            payload.content = '✅ Verificação concluída! Configure suas preferências abaixo (opcional).';
            await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
            return true;
        }

        if (id.startsWith('ticket_feedback_rate:') || id.startsWith('ticket_feedback_resolved:')) {
            const parts = id.split(':');
            const action = parts[0];
            const ticketId = parts[1];
            const value = parts[2];

            let patch;
            if (action === 'ticket_feedback_rate') {
                const rating = Number(value);
                if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
                    await interaction.reply({ content: '❌ Avaliação inválida.', ephemeral: interaction.inGuild?.() ? true : undefined }).catch(() => {});
                    return true;
                }
                patch = { rating };
            } else {
                if (value !== 'yes' && value !== 'no') {
                    await interaction.reply({ content: '❌ Resposta inválida.', ephemeral: interaction.inGuild?.() ? true : undefined }).catch(() => {});
                    return true;
                }
                patch = { resolved: value === 'yes' };
            }

            const result = TicketSystem.updateUserFeedback(ticketId, userId, patch);
            if (!result.ok) {
                await interaction.reply({ content: `❌ ${result.message}`, ephemeral: interaction.inGuild?.() ? true : undefined }).catch(() => {});
                return true;
            }

            const feedback = result.entry?.userFeedback || {};
            const ratingText = feedback.rating ? `${feedback.rating}/5` : '—';
            const resolvedText = feedback.resolved === true ? 'Sim' : (feedback.resolved === false ? 'Não' : '—');
            const done = Boolean(feedback.rating) && (feedback.resolved === true || feedback.resolved === false);

            const buildComponents = () => {
                if (done) return [];

                const rateRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${ticketId}:1`).setEmoji('⭐').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(feedback.rating)),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${ticketId}:2`).setEmoji('⭐').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(feedback.rating)),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${ticketId}:3`).setEmoji('⭐').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(feedback.rating)),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${ticketId}:4`).setEmoji('⭐').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(feedback.rating)),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${ticketId}:5`).setEmoji('⭐').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(feedback.rating))
                );

                const resolvedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket_feedback_resolved:${ticketId}:yes`).setLabel('Resolvido').setStyle(ButtonStyle.Success).setDisabled(feedback.resolved === true || feedback.resolved === false),
                    new ButtonBuilder().setCustomId(`ticket_feedback_resolved:${ticketId}:no`).setLabel('Não resolvido').setStyle(ButtonStyle.Danger).setDisabled(feedback.resolved === true || feedback.resolved === false)
                );

                return [rateRow, resolvedRow];
            };

            await interaction.update({
                content: `✅ Feedback registrado para **${ticketId}**.\n⭐ Avaliação: **${ratingText}**\n✅ Resolvido?: **${resolvedText}**${done ? '\n\nObrigado!' : ''}`,
                components: buildComponents()
            }).catch(async () => {
                await interaction.reply({ content: `✅ Feedback registrado para **${ticketId}**.`, ephemeral: interaction.inGuild?.() ? true : undefined }).catch(() => {});
            });

            if (done) {
                const config = TicketSystem.getTicketConfig();
                if (config.logsChannelId) {
                    const logsChannel = await client.channels.fetch(config.logsChannelId).catch(() => null);
                    if (logsChannel) {
                        const feedbackEmbed = new EmbedBuilder()
                            .setTitle('📊 Feedback de ticket')
                            .addFields(
                                { name: 'Ticket', value: ticketId, inline: true },
                                { name: 'Usuário', value: `<@${userId}>`, inline: true },
                                { name: 'Avaliação', value: ratingText, inline: true },
                                { name: 'Resolvido?', value: resolvedText, inline: true }
                            )
                            .setColor('#5865F2')
                            .setFooter({ text: 'Toxic 2.0' })
                            .setTimestamp();
                        await logsChannel.send({ embeds: [feedbackEmbed] }).catch(() => {});
                    }
                }
            }

            return true;
        }

        if (id === 'ticket_admin_menu') return true; // Desativado, agora é select menu fixo

        if (id === 'ticket_view_all') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode ver o histórico de tickets.', ephemeral: true });
            }

            const history = TicketSystem.loadTicketHistory().slice(0, 25);
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Histórico de tickets')
                .setDescription('Selecione um ticket abaixo para baixar a transcrição (HTML).')
                .setColor('#5865F2')
                .setFooter({ text: 'Toxic 2.0' });

            if (history.length === 0) {
                return interaction.reply({ content: '📭 Nenhum ticket encerrado foi encontrado no histórico.', ephemeral: true });
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('ticket_history_select')
                .setPlaceholder('Selecione um ticket')
                .addOptions(history.map(entry => ({
                    label: `${entry.ticketId} • ${entry.userTag || 'usuário'}`.slice(0, 100),
                    description: `Encerrado: ${entry.closedAt ? new Date(entry.closedAt).toLocaleString('pt-BR') : 'N/A'} | Motivo: ${String(entry.reason || '').slice(0, 50)}`.slice(0, 100),
                    value: entry.ticketId
                })));

            const row = new ActionRowBuilder().addComponents(select);

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            return true;
        }

        if (id === 'ticket_open') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_create')
                .setTitle('Abrir ticket');

            const reasonInput = new TextInputBuilder()
                .setCustomId('ticket_reason')
                .setLabel('Motivo')
                .setPlaceholder('Ex: Dúvida, denúncia, parceria, bug…')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('ticket_description')
                .setLabel('Descrição')
                .setPlaceholder('Explique o contexto, o que aconteceu e o que você precisa.')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(reasonInput),
                new ActionRowBuilder().addComponents(descriptionInput)
            );
            await interaction.showModal(modal);
            return true;
        }

        if (id === 'ticket_claim') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode assumir tickets.', ephemeral: true });
            }

            const result = await TicketSystem.claimTicket(interaction.channel, interaction.user);
            if (!result.success) {
                return interaction.reply({ content: result.message, ephemeral: true });
            }

            await interaction.deferUpdate();
            return true;
        }

        if (id === 'ticket_release') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));

            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode liberar tickets.', ephemeral: true });
            }

            const result = await TicketSystem.releaseTicket(interaction.channel, interaction.user);
            if (!result.success) {
                return interaction.reply({ content: result.message, ephemeral: true });
            }

            await interaction.deferUpdate();
            return true;
        }

        if (id === 'ticket_staff_transcript') {
            await interaction.deferReply({ ephemeral: true });

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Apenas a staff pode gerar transcripts.' });
            }

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            const transcript = await TicketSystem.generateTranscript(interaction.channel, ticket);
            if (!transcript) {
                return interaction.editReply({ content: '❌ Falha ao gerar transcript.' });
            }

            const fileName = `transcript-${ticket?.ticketId || interaction.channel.name}.html`;
            const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: fileName });
            await interaction.editReply({ content: '✅ Transcript gerado.', files: [file] });
            return true;
        }

        if (id === 'ticket_staff_summary' || id === 'ticket_staff_ai_summary') {
            await interaction.deferReply({ ephemeral: true });

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Apenas a staff pode gerar resumo.' });
            }

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket não encontrado.' });
            }

            const intakeText = ticket.intake?.text || ticket.ai?.intake || ticket.intake?.intake || null;
            if (!intakeText) {
                return interaction.editReply({ content: '⚠️ Nenhum pré-atendimento foi enviado ainda. Peça para o usuário clicar em **Pré-atendimento**.' });
            }

            const summary = TicketIntakeAssistant.buildSummary({ ticket, intakeText });

            const next = TicketSystem.activeTickets.get(interaction.channelId) || ticket;
            const currentIntake = next.intake || next.ai || {};

            next.intake = {
                ...currentIntake,
                enabled: currentIntake.enabled !== false,
                text: intakeText,
                submittedAt: currentIntake.submittedAt || currentIntake.intakeSubmittedAt || Date.now(),
                category: summary.category,
                priority: summary.priority,
                summary: summary.summary,
                keyDetails: summary.keyDetails,
                missingInfo: summary.missingInfo,
                nextStepsStaff: summary.nextStepsStaff,
                suggestedReplyToUser: summary.suggestedReplyToUser,
                lastSummaryAt: Date.now()
            };

            const priorityRank = { low: 0, normal: 1, high: 2, urgent: 3 };
            const currentPriority = String(next.priority || 'normal').toLowerCase();
            if (priorityRank[summary.priority] > (priorityRank[currentPriority] ?? 1)) {
                next.priority = summary.priority;
            }

            if (next.stage === 'waiting_user') {
                next.stage = next.claimedBy ? 'in_progress' : 'new';
            }

            TicketSystem.activeTickets.set(interaction.channelId, next);
            TicketSystem.persistActiveTickets();
            await TicketSystem.refreshTicket(interaction.channel);

            await interaction.editReply({ content: '✅ Resumo atualizado no painel staff.' });
            return true;
        }

        if (id === 'ticket_staff_notes') {
            await interaction.deferReply({ ephemeral: true });

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Apenas a staff pode ver notas.' });
            }

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket não encontrado.' });
            }

            const notes = Array.isArray(ticket.staffNotes) ? ticket.staffNotes : [];
            const preview = notes.slice(0, 5).map(note => {
                const author = note.authorId ? `<@${note.authorId}>` : '—';
                const time = note.createdAt ? `<t:${Math.floor(note.createdAt / 1000)}:R>` : '—';
                const content = String(note.content || '').trim().slice(0, 180);
                return `• ${time} • ${author}\n> ${content || '—'}`;
            }).join('\n\n') || 'Nenhuma nota interna registrada.';

            const embed = new EmbedBuilder()
                .setTitle('🗒️ Notas internas')
                .setDescription(preview.slice(0, 4000))
                .setColor('#2B2D31')
                .setFooter({ text: ticket.ticketId ? `Ticket ${ticket.ticketId}` : 'Ticket' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_staff_add_note')
                    .setLabel('Adicionar nota')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            return true;
        }

        if (id === 'ticket_staff_add_note') {
            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode adicionar notas.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_staff_add_note')
                .setTitle('Adicionar nota interna');

            const noteInput = new TextInputBuilder()
                .setCustomId('note')
                .setLabel('Nota (privado)')
                .setPlaceholder('Ex: usuário enviou print em 18/04, aguardando prova adicional…')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1500);

            modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
            await interaction.showModal(modal);
            return true;
        }

        if (id === 'ticket_intake' || id === 'ticket_ai_intake') {
            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
            }

            const isOwner = interaction.user.id === ticket.userId;
            if (!isOwner) {
                return interaction.reply({ content: '❌ Apenas o criador do ticket pode responder o pré-atendimento.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_intake')
                .setTitle('Pré-atendimento — Coleta inicial');

            const topicInput = new TextInputBuilder()
                .setCustomId('topic')
                .setLabel('Tipo (bug/denúncia/parceria/outro)')
                .setPlaceholder('Ex: bug')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(60);

            const contextInput = new TextInputBuilder()
                .setCustomId('context')
                .setLabel('O que você precisa? (detalhes)')
                .setPlaceholder('Explique com mais contexto o problema/solicitação.')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(900);

            const stepsInput = new TextInputBuilder()
                .setCustomId('steps')
                .setLabel('Passos/horário (se aplicável)')
                .setPlaceholder('Como reproduzir? Quando aconteceu?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(900);

            const triedInput = new TextInputBuilder()
                .setCustomId('tried')
                .setLabel('O que você já tentou?')
                .setPlaceholder('Ex: reiniciei, limpei cache, testei em outra conta…')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(900);

            const linksInput = new TextInputBuilder()
                .setCustomId('links')
                .setLabel('Links/IDs/prints (opcional)')
                .setPlaceholder('Cole links e IDs relevantes (sem expor senhas).')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(900);

            modal.addComponents(
                new ActionRowBuilder().addComponents(topicInput),
                new ActionRowBuilder().addComponents(contextInput),
                new ActionRowBuilder().addComponents(stepsInput),
                new ActionRowBuilder().addComponents(triedInput),
                new ActionRowBuilder().addComponents(linksInput)
            );

            await interaction.showModal(modal);
            return true;
        }

        if (id === 'ticket_call_staff') {
            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
            }

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });
            const isOwner = interaction.user.id === ticket.userId;

            if (!isOwner && !isStaff) {
                return interaction.reply({ content: '❌ Você não tem permissão para acionar a staff neste ticket.', ephemeral: true });
            }

            const now = Date.now();
            const cooldownMs = 2 * 60 * 1000;
            if (ticket.lastCallAt && now - ticket.lastCallAt < cooldownMs) {
                const remaining = Math.ceil((cooldownMs - (now - ticket.lastCallAt)) / 1000);
                return interaction.reply({ content: `⏳ Aguarde ${remaining}s para chamar a staff novamente.`, ephemeral: true });
            }

            ticket.lastCallAt = now;
            TicketSystem.activeTickets.set(interaction.channelId, ticket);
            TicketSystem.persistActiveTickets();

            const safeTicketId = ticket.ticketId || interaction.channel.name.toUpperCase();

            if (ticket.claimedBy) {
                const claimedUser = await client.users.fetch(ticket.claimedBy).catch(() => null);
                if (claimedUser) {
                    await claimedUser.send(`🔔 Você foi chamado no ticket **${safeTicketId}** (${interaction.channel.toString()}).`).catch(() => {});
                }
                await interaction.reply({ content: '✅ Aviso enviado ao responsável pelo ticket.', ephemeral: true });
                return true;
            }

            if (ticketConfig.supportRoleId) {
                await interaction.channel.send({
                    content: `🔔 ${interaction.user} solicitou suporte. <@&${ticketConfig.supportRoleId}>`,
                    allowedMentions: { roles: [ticketConfig.supportRoleId], users: [interaction.user.id] }
                }).catch(() => {});

                await interaction.reply({ content: '✅ Staff notificada.', ephemeral: true });
                return true;
            }

            await interaction.reply({ content: '⚠️ Nenhum cargo de suporte está configurado em `/botconfig` → Tickets.', ephemeral: true });
            return true;
        }

        if (id === 'ticket_close') {
            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ Ticket não encontrado.', ephemeral: true });
            }

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.reply({ content: '❌ Apenas a staff pode encerrar tickets.', ephemeral: true });
            }

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

            return interaction.reply({
                content: 'Encerrar ticket. Informe o resultado do atendimento:',
                components: [row],
                ephemeral: true
            });
        }

        if (id === 'ticket_confirm_close_resolved') {
            await interaction.update({ content: '🔒 Encerrando ticket...', components: [] });
            await TicketSystem.closeTicket(interaction.channel, interaction.user, client, { resolvedByStaff: true });
            return true;
        }

        if (id === 'ticket_confirm_close_unresolved') {
            await interaction.update({ content: '🔒 Encerrando ticket...', components: [] });
            await TicketSystem.closeTicket(interaction.channel, interaction.user, client, { resolvedByStaff: false });
            return true;
        }

        if (id === 'ticket_cancel_close') {
            await interaction.update({ content: '✅ Encerramento cancelado.', components: [] });
            return true;
        }

        return false;

    } catch (error) {
        console.error('ERRO NO BUTTON HANDLER:', error);
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Ocorreu um erro interno.', ephemeral: true }).catch(() => {});
        return true;
    }
};

