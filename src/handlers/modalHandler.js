const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const Config = require('../utils/configManager');
const Logger = require('../utils/logger');
const TempCache = require('../utils/tempCache');
const { PermissionFlagsBits } = require('discord.js');
const { normalizeRoleIds, isStaffMember } = require('../utils/permissionUtils');
const { createUniqueGameKey, parseEmojiInput, normalizeGameRoles } = require('../utils/verificationPreferences');

// Helper para importar painÃ©is (evita dependÃªncia circular)
const getPanel = (name) => {
    try {
        const fileName = name.endsWith('Panel') ? name : `${name}Panel`;
        return require(`../panels/botconfig/${fileName}`);
    } catch (e) {
        return null;
    }
};

const TicketSystem = require('../utils/ticketSystem');
const TicketIntakeAssistant = require('../utils/ticketIntakeAssistant');

const modalHandler = async (client, interaction) => {
    if (!interaction.isModalSubmit()) return;
    
    const id = interaction.customId;

    try {
        if (id === 'modal_ticket_admin_add') {
            const rawUserId = interaction.fields.getTextInputValue('user_id');
            const userId = String(rawUserId || '').replace(/[<@!>]/g, '').trim();
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (!member) return interaction.reply({ content: '❌ Usuário não encontrado no servidor.', ephemeral: true });
            
            await interaction.channel.permissionOverwrites.edit(member.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
            return interaction.reply({ content: `✅ <@${member.id}> foi adicionado ao ticket.` });
        }

        if (id === 'modal_ticket_admin_remove') {
            const rawUserId = interaction.fields.getTextInputValue('user_id');
            const userId = String(rawUserId || '').replace(/[<@!>]/g, '').trim();
            const ticket = require('../utils/ticketSystem').activeTickets.get(interaction.channelId);
            if (userId === ticket?.userId) return interaction.reply({ content: '❌ Não é possível remover o criador do ticket.', ephemeral: true });

            await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});
            return interaction.reply({ content: '✅ Usuário removido do ticket.' });
        }

        if (id === 'modal_ticket_admin_ban') {
            await interaction.deferReply({ ephemeral: true });

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Acesso negado.' });
            }

            const raw = interaction.fields.getTextInputValue('user_id');
            const targetId = String(raw || '').replace(/[<@!>]/g, '').trim();
            const reason = interaction.fields.getTextInputValue('reason') || 'Ação administrativa em ticket.';

            if (!/^\d{17,20}$/.test(targetId)) {
                return interaction.editReply({ content: '❌ ID inválido.' });
            }

            if (targetId === interaction.user.id) {
                return interaction.editReply({ content: '❌ Você não pode banir a si mesmo.' });
            }

            try {
                await interaction.guild.members.ban(targetId, { reason });
            } catch (error) {
                return interaction.editReply({ content: `❌ Falha ao banir: ${error.message}` });
            }

            await interaction.editReply({ content: `✅ <@${targetId}> foi banido. Motivo: ${reason}` });
            await interaction.channel.send({ content: `⛔ Ação: <@${targetId}> banido por ${interaction.user}.` }).catch(() => {});
            return;
        }

        if (id === 'modal_ticket_history_search') {
            await interaction.deferReply({ ephemeral: true });

            const ticketId = String(interaction.fields.getTextInputValue('ticket_id') || '').trim().toUpperCase();
            const transcript = TicketSystem.getTranscriptFile(ticketId);

            if (!transcript) {
                return interaction.editReply({ content: '❌ Transcrição não encontrada.' });
            }

            const { AttachmentBuilder } = require('discord.js');
            const file = new AttachmentBuilder(transcript.buffer, { name: transcript.fileName });
            await interaction.editReply({ content: `✅ Transcrição do **${ticketId}**.`, files: [file] });
            return;
        }

        if (id === 'modal_ticket_create') {
            await interaction.deferReply({ ephemeral: true });
            
            const reason = interaction.fields.getTextInputValue('ticket_reason');
            const description = interaction.fields.getTextInputValue('ticket_description');
            const result = await TicketSystem.createTicket(interaction.guild, interaction.user, reason, description);
            
            if (result.success) {
                await interaction.editReply({ content: `✅ Ticket criado com sucesso!\n📍 Acesse: <#${result.channel.id}>` });
            } else {
                await interaction.editReply({ content: `❌ ${result.message}` });
            }
            return;
        }

        if (id === 'modal_ticket_intake' || id === 'modal_ticket_ai_intake') {
            await interaction.deferReply({ ephemeral: true });

            const ticket = TicketSystem.activeTickets.get(interaction.channelId);
            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket não encontrado.' });
            }

            if (interaction.user.id !== ticket.userId) {
                return interaction.editReply({ content: '❌ Apenas o criador do ticket pode responder o pré-atendimento.' });
            }

            let topic = '';
            try {
                topic = interaction.fields.getTextInputValue('topic') || '';
            } catch (e) {
                topic = '';
            }
            const context = interaction.fields.getTextInputValue('context') || '';
            const steps = interaction.fields.getTextInputValue('steps') || '';
            const tried = interaction.fields.getTextInputValue('tried') || '';
            const links = interaction.fields.getTextInputValue('links') || '';

            const intakeParts = [
                topic ? `Tipo: ${String(topic).trim()}` : null,
                `Contexto: ${String(context).trim()}`,
                steps ? `Passos/horário: ${String(steps).trim()}` : null,
                tried ? `Já tentei: ${String(tried).trim()}` : null,
                links ? `Links/IDs: ${String(links).trim()}` : null
            ].filter(Boolean);

            const intakeText = intakeParts.join('\n');

            const summary = TicketIntakeAssistant.buildSummary({ ticket, intakeText });

            const currentIntake = ticket.intake || ticket.ai || {};
            ticket.intake = {
                ...currentIntake,
                enabled: currentIntake.enabled !== false,
                text: intakeText,
                submittedAt: Date.now(),
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
            const currentPriority = String(ticket.priority || 'normal').toLowerCase();
            if (priorityRank[summary.priority] > (priorityRank[currentPriority] ?? 1)) {
                ticket.priority = summary.priority;
            }

            if (ticket.stage === 'waiting_user') {
                ticket.stage = ticket.claimedBy ? 'in_progress' : 'new';
            }

            TicketSystem.activeTickets.set(interaction.channelId, ticket);
            TicketSystem.persistActiveTickets();
            await TicketSystem.refreshTicket(interaction.channel);

            const suggested = ticket.intake.suggestedReplyToUser || '✅ Recebido! Se tiver prints/links/IDs, envie aqui no ticket para acelerar o atendimento.';

            const safeTicketId = ticket.ticketId || interaction.channel?.name?.toUpperCase?.() || 'TICKET';
            const intakeBlock = ['```fix', 'PRE_ATTENDANCE: SUBMITTED', `PROTOCOL: ${safeTicketId}`, 'STATUS: SYNCED_TO_STAFF_PANEL', '```'].join('\n');

            const assistantEmbed = new EmbedBuilder()
                .setTitle('🛰️ Pré-atendimento recebido')
                .setDescription([intakeBlock, '', suggested, '', '📌 *A staff já recebeu um resumo no painel interno do ticket.*'].join('\n').slice(0, 4096))
                .setColor('#57F287')
                .setFooter({ text: 'Toxic 2.0 • Pré-atendimento' });

            const assistantRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_intake')
                    .setLabel('Atualizar pré-atendimento')
                    .setStyle(ButtonStyle.Primary)
            );

            const intakeMessageId = ticket.intakeMessageId || ticket.aiMessageId || null;
            if (intakeMessageId) {
                const msg = await interaction.channel.messages.fetch(intakeMessageId).catch(() => null);
                if (msg) {
                    await msg.edit({ embeds: [assistantEmbed], components: [assistantRow] }).catch(() => {});
                }
            } else {
                const msg = await interaction.channel.send({ embeds: [assistantEmbed], components: [assistantRow] }).catch(() => null);
                if (msg) {
                    ticket.intakeMessageId = msg.id;
                    TicketSystem.activeTickets.set(interaction.channelId, ticket);
                    TicketSystem.persistActiveTickets();
                }
            }

            await interaction.editReply({ content: '✅ Pré-atendimento enviado. Obrigado! A staff já recebeu um resumo no painel.' });
            return;
        }

        if (id === 'modal_ticket_staff_add_note') {
            await interaction.deferReply({ ephemeral: true });

            const ticketConfig = TicketSystem.getTicketConfig();
            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const member = interaction.member;
            const isStaff = isStaffMember(member, { staffRoleIds, supportRoleId: ticketConfig.supportRoleId });

            if (!isStaff) {
                return interaction.editReply({ content: '❌ Apenas a staff pode adicionar notas.' });
            }

            const note = interaction.fields.getTextInputValue('note');
            const result = TicketSystem.addStaffNote(interaction.channelId, interaction.user.id, note);
            if (!result.ok) {
                return interaction.editReply({ content: `❌ ${result.message}` });
            }

            await TicketSystem.refreshTicket(interaction.channel);
            await interaction.editReply({ content: '✅ Nota interna adicionada.' });
            return;
        }

        if (id === 'modal_ticket_ai_model') {
            await interaction.deferReply({ ephemeral: true });

            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            const allowed = isStaffMember(interaction.member, { staffRoleIds });
            if (!allowed) {
                return interaction.editReply({ content: '❌ Acesso negado.' });
            }

            await interaction.editReply({ content: '⚠️ Configuração de modelo removida: o pré-atendimento não usa IA externa.' });
            return;
        }

        if (id.startsWith('modal_cartinha:')) {
            const targetId = id.split(':')[1];
            const title = interaction.fields.getTextInputValue('title');
            const content = interaction.fields.getTextInputValue('content');
            const image = interaction.fields.getTextInputValue('image');
            const colorInput = interaction.fields.getTextInputValue('color') || '#5865F2';
            const anonInput = interaction.fields.getTextInputValue('anon').toLowerCase();
            const isAnon = anonInput === 'sim' || anonInput === 's';

            const targetUser = await client.users.fetch(targetId).catch(() => null);
            if (!targetUser) return interaction.reply({ content: '❌ Usuário não encontrado.', ephemeral: true });

            const cartinhaEmbed = new EmbedBuilder()
                .setTitle(`ðŸ’Œ ${title}`)
                .setDescription(content)
                .setColor(colorInput.startsWith('#') ? colorInput : '#5865F2')
                .setTimestamp();

            if (image && image.startsWith('http')) cartinhaEmbed.setImage(image);
            
            if (isAnon) {
                cartinhaEmbed.setAuthor({ name: 'Remetente Anônimo', iconURL: 'https://cdn-icons-png.flaticon.com/512/149/149071.png' });
            } else {
                cartinhaEmbed.setAuthor({ name: `De: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
            }

            await targetUser.send({ embeds: [cartinhaEmbed] }).then(async () => {
                await interaction.reply({ content: `✅ Cartinha enviada com sucesso para **${targetUser.tag}**!`, ephemeral: true });
            }).catch(async () => {
                await interaction.reply({ content: '❌ Não consegui enviar a cartinha. O usuário pode estar com a DM fechada.', ephemeral: true });
            });
            return;
        }
        // ====================================================
        // 1. VERIFICAÃ‡ÃƒO LOL (CAPTCHA DM - SEM RIOT API)
        // ====================================================
        if (id === 'modal_lol_verify') {
            await interaction.deferReply({ ephemeral: true });
            
            const nick = interaction.fields.getTextInputValue('nick');
            const tag = interaction.fields.getTextInputValue('tag');
            const cachedData = TempCache.get(interaction.user.id) || {};
            const inviteSource = cachedData.inviteSource || null;

            // Gera cÃ³digo de 4 dÃ­gitos para o desafio
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            
            // Salva no cache os dados do invocador e o cÃ³digo gerado
            TempCache.set(interaction.user.id, { 
                inviteSource, 
                code, 
                summoner: { name: nick, tag: tag } 
            });

            try {
                const captchaEmbed = new EmbedBuilder()
                    .setTitle('🔐 VERIFICAÇÃO | PROTOCOLO DE ACESSO')
                    .setDescription('```fix\nSTATUS: AGUARDANDO CÓDIGO\nSEGURANÇA: ATIVA\n```\nPara concluir a verificação, insira o código abaixo.')
                    .addFields(
                        { name: '🔑 CÓDIGO DE VERIFICAÇÃO', value: `\`\`\`\n${code}\n\`\`\`` }
                    )
                    .setColor('#0B1E3A')
                    .setFooter({ text: interaction.guild?.name || 'Sistema de Verificação' })
                    .setTimestamp();

                // Envia a DM e LOGA se falhou
                await interaction.user.send({ embeds: [captchaEmbed] }).catch(err => {
                    throw new Error(`DM_CLOSED: ${err.message}`);
                });
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_enter_code')
                        .setLabel('Inserir código')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔐')
                );
                
                await interaction.editReply({ 
                    content: `✅ Conta vinculada: **${nick} #${tag}**\n📩 Enviamos um **código de verificação** na sua DM. Use o botão abaixo para inserir o código e concluir.`, 
                    components: [row] 
                });
            } catch (e) {
                if (e.message.includes('DM_CLOSED')) {
                    await interaction.editReply('❌ **Sua DM está fechada!**\nNão consegui enviar o código de verificação. Por favor:\n1. Vá em Configurações do Usuário > Privacidade e Segurança\n2. Ative "Permitir mensagens diretas de membros do servidor"\n3. Tente novamente.');
                } else {
                    Logger.log(`Erro ao enviar Captcha: ${e.message}`, 'ERROR');
                    await interaction.editReply('❌ Ocorreu um erro ao processar sua entrada. Tente novamente mais tarde.');
                }
            }
            return;
        }

        if (id === 'modal_verify_code') {
            await interaction.deferReply({ ephemeral: true });

            const input = interaction.fields.getTextInputValue('code');
            const data = TempCache.get(interaction.user.id);
            
            if (data && data.code === input) {
                const member = interaction.member;

                // A. Dar Cargo
                const roleId = Config.get('roles.verified');
                if (roleId) {
                    try { await member.roles.add(roleId); } 
                    catch(e) { Logger.log(`Erro Cargo: ${e.message}`, 'WARN'); }
                }

                // B. Mudar Nickname
                const newNick = `${data.summoner.name} #${data.summoner.tag}`;
                if (interaction.guild.ownerId !== interaction.user.id) {
                    try {
                         if (interaction.guild.members.me.permissions.has('ManageNicknames') && 
                            interaction.guild.members.me.roles.highest.position > member.roles.highest.position) {
                            await member.setNickname(newNick.substring(0, 32));
                         }
                    } catch (e) { Logger.log(`Erro Nick: ${e.message}`, 'WARN'); }
                }

                // C. Anti-Raid: remover quarentena (se existir)
                const quarantineRoleId = String(Config.get('moderation.antiRaid.quarantineRoleId') || '').trim();
                if (quarantineRoleId && member.roles?.cache?.has?.(quarantineRoleId)) {
                    try {
                        await member.roles.remove(quarantineRoleId, 'Verificação concluída: removendo quarentena Anti-Raid.');
                    } catch (e) {
                        Logger.log(`Falha ao remover quarentena (${member.id}): ${e.message}`, 'WARN');
                    }
                }

                // D. ENVIO DA DM DE REGRAS ESTILIZADA (CONFORME IMAGEM)
                try {
                    const guildName = interaction.guild?.name || 'servidor';
                    const rulesEmbed = new EmbedBuilder()
                        .setTitle('📘 Diretrizes do Servidor')
                        .setDescription(`Olá **${interaction.user.username}**, bem-vindo(a) ao **${guildName}**!\n\nPara manter um ambiente seguro e organizado, siga as diretrizes abaixo:`)
                        .addFields(
                            { 
                                name: '1. 🧠 Respeito', 
                                value: '> Trate todos com respeito. Assédio, discurso de ódio, sexismo, racismo ou qualquer forma de discriminação resultam em banimento imediato.' 
                            },
                            { 
                                name: '2. 🚫 Conteúdo Proibido', 
                                value: '> É proibido compartilhar pornografia, violência extrema ou conteúdo ilegal. Mantenha o servidor seguro para todos.' 
                            },
                            { 
                                name: '3. 📢 Sem Spam ou Flood', 
                                value: '> Evite mensagens repetitivas, excesso de emojis ou menções sem necessidade.' 
                            },
                            { 
                                name: '4. 🔗 Divulgação', 
                                value: '> Não envie convites de outros servidores ou links de vendas no chat ou DM dos membros sem permissão da equipe de moderação.' 
                            },
                            { 
                                name: '5. 🔒 Privacidade', 
                                value: '> Não compartilhe informações pessoais (doxxing) de outros membros. Proteja sua privacidade.' 
                            },
                            {
                                name: '\u200B',
                                value: '📘 *Ao permanecer no servidor, você concorda com os Termos de Serviço do Discord.*'
                            }
                        )
                        .setColor('#0B1E3A')
                        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3534/3534033.png')
                        .setFooter({ text: interaction.guild?.name || 'Diretrizes' })
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('Diretrizes da Comunidade').setStyle(ButtonStyle.Link).setURL('https://discord.com/guidelines'),
                        new ButtonBuilder().setLabel('Termos de Serviço').setStyle(ButtonStyle.Link).setURL('https://discord.com/terms'),
                        new ButtonBuilder().setLabel('Suporte Discord').setStyle(ButtonStyle.Link).setURL('https://support.discord.com')
                    );

                    await interaction.user.send({ embeds: [rulesEmbed], components: [row] }).catch(() => {});
                } catch (dmError) {
                    Logger.log(`Falha ao enviar Regras DM para ${interaction.user.tag}: DM Fechada.`, 'WARN');
                }

                TempCache.delete(interaction.user.id);

                // E. Preferências (opt-in) via select menus
                try {
                    const { buildVerificationOnboardingPayload } = require('../utils/verificationOnboardingUi');
                    const payload = buildVerificationOnboardingPayload({ guild: interaction.guild, member });
                    await interaction.editReply(payload);
                } catch (error) {
                    Logger.log(`Falha ao renderizar onboarding de verificação: ${error.message}`, 'WARN');
                    await interaction.editReply({ content: '✅ Verificação concluída! Acesso liberado.' }).catch(() => {});
                }
            } else {
                await interaction.editReply({ content: '❌ **Código incorreto.** A verificação falhou. Tente novamente.' });
            }
            return;
        }

        // ====================================================
        // 2. IDENTIDADE DO BOT
        // ====================================================
        if (id.startsWith('modal_botconfig_role_ai_create:')) {
            await interaction.deferReply({ ephemeral: true });

            if (!interaction.inGuild?.()) {
                await interaction.editReply({ content: '❌ Este setup só pode ser usado dentro do servidor.' });
                return;
            }

            const parseHexColor = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return null;
                const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
                if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
                return parseInt(normalized, 16);
            };

            const target = String(id.split(':')[1] || '').trim() || 'staff';
            const templates = {
                staff: { label: 'Staff/Admin', name: 'Staff', color: 0xED4245, hoist: true },
                verified: { label: 'Verificado', name: 'Verificado', color: 0x00E5FF, hoist: false },
                muted: { label: 'Muted', name: 'Muted', color: 0x80848E, hoist: false },
                trusted: { label: 'Trusted', name: 'Trusted', color: 0x57F287, hoist: false }
            };

            const template = templates[target] || templates.staff;
            const nameInput = String(interaction.fields.getTextInputValue('role_name') || '').trim();
            const colorInput = String(interaction.fields.getTextInputValue('role_color') || '').trim();

            const roleName = nameInput || template.name;
            const roleColor = parseHexColor(colorInput) ?? template.color;

            const guild = interaction.guild;
            const existingRole = guild.roles.cache.find(role => role.name.toLowerCase() === roleName.toLowerCase()) || null;
            let role = existingRole;

            if (!role) {
                const me = guild.members.me;
                if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
                    await interaction.editReply({ content: '❌ Eu preciso da permissão **Gerenciar Cargos** para criar cargos automaticamente.' });
                    return;
                }

                try {
                    role = await guild.roles.create({
                        name: roleName,
                        color: roleColor,
                        mentionable: false,
                        hoist: template.hoist,
                        reason: `BotConfig IA • ${template.label}`
                    });
                } catch (error) {
                    await interaction.editReply({ content: `❌ Falha ao criar o cargo: ${error.message}` });
                    return;
                }
            }

            try {
                if (target === 'staff') {
                    const current = normalizeRoleIds(Config.get('roles.staff'));
                    const next = Array.from(new Set([...current, role.id]));
                    Config.set('roles.staff', next);
                } else {
                    Config.set(`roles.${target}`, role.id);
                }
            } catch (error) {
                await interaction.editReply({ content: `❌ Falha ao salvar configuração: ${error.message}` });
                return;
            }

            await interaction.editReply({ content: `✅ Cargo configurado: ${role} (**${template.label}**)` });

            const rolesPanel = getPanel('rolesPanel');
            if (rolesPanel) setTimeout(() => rolesPanel(interaction, { target }).catch(() => {}), 1000);
            return;
        }

        if (id === 'modal_bot_config') {
            await interaction.deferReply({ ephemeral: true });
            
            const newName = interaction.fields.getTextInputValue('bot_name');
            const newNick = interaction.fields.getTextInputValue('bot_nick');
            const newAvatar = interaction.fields.getTextInputValue('bot_avatar');
            const newStatus = interaction.fields.getTextInputValue('bot_status');
            const newActivity = interaction.fields.getTextInputValue('bot_activity');

            if (newName && newName !== client.user.username) try { await client.user.setUsername(newName); Config.set('bot.name', newName); } catch(e){}
            if (newNick) try { await interaction.guild.members.me.setNickname(newNick); } catch(e){}
            if (newAvatar && newAvatar.startsWith('http')) try { await client.user.setAvatar(newAvatar); Config.set('bot.avatar', newAvatar); } catch(e){}
            
            if (newStatus || newActivity) {
                const statusInput = String(newStatus || '').trim().toLowerCase();
                const activityInput = String(newActivity || '').trim();

                const statusMap = new Set(['online', 'idle', 'dnd', 'invisible']);
                const statusValue = statusMap.has(statusInput) ? statusInput : (Config.get('bot.status') || 'online');

                let nextActivityText = activityInput || Config.get('bot.activityText') || '';
                let nextActivityType = Number(Config.get('bot.activityType') ?? ActivityType.Playing);

                const match = activityInput.match(/^\s*(playing|streaming|listening|watching|competing|custom)\s*:\s*(.+)$/i);
                if (match) {
                    const typeToken = match[1].toLowerCase();
                    nextActivityText = match[2].trim();

                    const typeMap = {
                        playing: ActivityType.Playing,
                        streaming: ActivityType.Streaming,
                        listening: ActivityType.Listening,
                        watching: ActivityType.Watching,
                        custom: ActivityType.Custom,
                        competing: ActivityType.Competing
                    };

                    nextActivityType = typeMap[typeToken] ?? nextActivityType;
                }

                Config.set('bot.status', statusValue);
                Config.set('bot.activityText', nextActivityText);
                Config.set('bot.activityType', nextActivityType);

                client.user.setPresence({
                    activities: [{ name: nextActivityText, type: nextActivityType }],
                    status: statusValue
                });
            }

            await interaction.editReply('✅ Identidade do bot atualizada.');
            const mainPanel = getPanel('mainPanel');
            if (mainPanel) setTimeout(() => mainPanel(interaction).catch(()=>{}), 1000);
            return;
        }

        if (id === 'modal_antiraid_threshold_custom') {
            await interaction.deferReply({ ephemeral: true });

            const raw = String(interaction.fields.getTextInputValue('threshold') || '').trim();
            const value = Number(raw);

            if (!Number.isInteger(value) || value < 2 || value > 100) {
                await interaction.editReply({ content: '❌ Valor inválido. Use um número inteiro entre **2** e **100**.' });
                return;
            }

            Config.set('moderation.antiRaid.joinThreshold', value);
            await interaction.editReply({ content: `✅ Limite Anti-Raid atualizado para **${value}** entradas.` });

            const securityPanel = getPanel('securityPanel');
            if (securityPanel) setTimeout(() => securityPanel(interaction).catch(() => {}), 1000);
            return;
        }

        if (id === 'modal_verification_game_add') {
            await interaction.deferReply({ ephemeral: true });

            const label = String(interaction.fields.getTextInputValue('game_label') || '').trim();
            const emojiInput = String(interaction.fields.getTextInputValue('game_emoji') || '').trim();

            if (!label) {
                await interaction.editReply({ content: '❌ Nome do jogo obrigatório.' });
                return;
            }

            const current = normalizeGameRoles(Config.get('verification.gameRoles'));
            if (current.length >= 50) {
                await interaction.editReply({ content: '❌ Limite atingido: remova alguns jogos antes de adicionar novos.' });
                return;
            }

            const existingKeys = current.map(entry => entry.key);
            const key = createUniqueGameKey(label, existingKeys);
            const emoji = parseEmojiInput(emojiInput);

            const next = current.concat({
                key,
                label,
                roleId: '',
                emoji
            });

            Config.set('verification.gameRoles', next);
            await interaction.editReply({ content: `✅ Jogo adicionado: **${label}**.` });

            const verificationPanel = getPanel('verificationPanel');
            if (verificationPanel) setTimeout(() => verificationPanel(interaction).catch(() => {}), 1000);
            return;
        }

        if (id.startsWith('modal_embed_save:')) {
             const parts = id.split(':');
             const embedKey = parts[1];
             const editType = parts[2];
             let currentConfig = Config.get(`embeds.${embedKey}`) || {};

             if (editType === 'content') {
                 const t = interaction.fields.getTextInputValue('title');
                 const d = interaction.fields.getTextInputValue('description');
                 if(t) currentConfig.title = t;
                 if(d) currentConfig.description = d;
             } else if (editType === 'visual') {
                 const c = interaction.fields.getTextInputValue('color');
                 const i = interaction.fields.getTextInputValue('image');
                 const th = interaction.fields.getTextInputValue('thumbnail');
                 if(c) currentConfig.color = c;
                 if(i) currentConfig.image = i;
                 if(th) currentConfig.thumbnail = th;
             } else if (editType === 'extra') {
                 const f = interaction.fields.getTextInputValue('footer');
                 const a = interaction.fields.getTextInputValue('author');
                 if(f) currentConfig.footer = f;
                 if(a) currentConfig.author = a;
             }
             Config.set(`embeds.${embedKey}`, currentConfig);
             interaction.customId = 'select_embed_type';
             interaction.values = [embedKey];
             const embedsPanel = getPanel('embedsPanel');
             if (embedsPanel) return embedsPanel(interaction);
             return interaction.reply({ content: 'âœ… Embed salva!', ephemeral: true });
        }

        if (id === 'modal_automod_addword') {
            const raw = interaction.fields.getTextInputValue('words_input');
            const words = raw.split(',').map(w=>w.trim().toLowerCase()).filter(w=>w);
            let list = Config.get('automod.badWords') || [];
            words.forEach(w => { if(!list.includes(w)) list.push(w); });
            Config.set('automod.badWords', list);
            const automodPanel = getPanel('automodPanel');
            if(automodPanel) return automodPanel(interaction);
            return interaction.reply({ content: '✅ Palavras adicionadas.', ephemeral: true });
        }

        if (id === 'modal_automod_removeword') {
            const word = interaction.fields.getTextInputValue('word_remove_input').trim().toLowerCase();
            let list = Config.get('automod.badWords') || [];
            if (list.includes(word)) {
                Config.set('automod.badWords', list.filter(w => w !== word));
                const automodPanel = getPanel('automodPanel');
                if(automodPanel) return automodPanel(interaction);
                return interaction.reply({ content: '✅ Palavra removida.', ephemeral: true });
            }
            await interaction.reply({content: '❌ Palavra não encontrada.', ephemeral: true});
            return;
        }

        if (id === 'modal_opgg_player') {
            const nick = interaction.fields.getTextInputValue('opgg_nick').trim();
            const tag = interaction.fields.getTextInputValue('opgg_tag').replace('#','').trim();
            const url = `https://www.op.gg/summoners/br/${encodeURIComponent(nick)}-${encodeURIComponent(tag)}`;
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ver Perfil').setStyle(ButtonStyle.Link).setURL(url));
            await interaction.reply({ content: `ðŸ” Resultado: ${nick} #${tag}`, components: [row], ephemeral: true });
            return;
        }

        if (id === 'modal_opgg_champion') {
            const raw = interaction.fields.getTextInputValue('opgg_champ_name').trim();
            const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
            const url = `https://www.op.gg/champions/${clean}/build`;
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel(`Build de ${raw}`).setStyle(ButtonStyle.Link).setURL(url));
            await interaction.reply({ content: `âš”ï¸ Build: ${raw}`, components: [row], ephemeral: true });
            return;
        }

        if (id === 'modal_ai_add_keyword') {
            const trigger = interaction.fields.getTextInputValue('trigger');
            const response = interaction.fields.getTextInputValue('response');
            let aiConfig = Config.get('ai') || { keywords: [], phrases: [] };
            if (!aiConfig.keywords) aiConfig.keywords = [];
            aiConfig.keywords.push({ trigger, response });
            Config.set('ai', aiConfig);
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Adicionado.', ephemeral: true }));
            const aiPanel = getPanel('aiPanel');
            if(aiPanel) return aiPanel(interaction);
            return;
        }

        if (id === 'modal_ai_add_phrase') {
            const phrase = interaction.fields.getTextInputValue('phrase');
            let aiConfig = Config.get('ai') || { keywords: [], phrases: [] };
            if (!aiConfig.phrases) aiConfig.phrases = [];
            aiConfig.phrases.push(phrase);
            Config.set('ai', aiConfig);
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Adicionado.', ephemeral: true }));
            const aiPanel = getPanel('aiPanel');
            if(aiPanel) return aiPanel(interaction);
            return;
        }

        if (id === 'modal_ai_remove_keyword') {
            const target = interaction.fields.getTextInputValue('trigger_rem').toLowerCase();
            let aiConfig = Config.get('ai') || { keywords: [], phrases: [] };
            if (aiConfig.keywords) {
                aiConfig.keywords = aiConfig.keywords.filter(k => k.trigger.toLowerCase() !== target);
                Config.set('ai', aiConfig);
            }
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Removido.', ephemeral: true }));
            const aiPanel = getPanel('aiPanel');
            if(aiPanel) return aiPanel(interaction);
            return;
        }

        if (id === 'modal_ai_remove_phrase') {
            const target = interaction.fields.getTextInputValue('phrase_rem');
            let aiConfig = Config.get('ai') || { keywords: [], phrases: [] };
            if (aiConfig.phrases) {
                aiConfig.phrases = aiConfig.phrases.filter(p => p !== target);
                Config.set('ai', aiConfig);
            }
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Removido.', ephemeral: true }));
            const aiPanel = getPanel('aiPanel');
            if(aiPanel) return aiPanel(interaction);
            return;
        }

        if (id === 'modal_creepy_add') {
            const phrase = interaction.fields.getTextInputValue('phrase');
            let config = Config.get('creepy') || {};
            if (!config.dmPhrases) config.dmPhrases = [];
            config.dmPhrases.push(phrase);
            Config.set('creepy', config);
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Adicionado.', ephemeral: true }));
            const creepyPanel = getPanel('creepyPanel');
            if(creepyPanel) return creepyPanel(interaction);
            return;
        }

        if (id === 'modal_creepy_remove') {
            const target = interaction.fields.getTextInputValue('phrase_rem');
            let config = Config.get('creepy') || {};
            if (config.dmPhrases) {
                config.dmPhrases = config.dmPhrases.filter(p => p !== target);
                Config.set('creepy', config);
            }
            await interaction.deferUpdate().catch(() => interaction.reply({ content: 'âœ… Removido.', ephemeral: true }));
            const creepyPanel = getPanel('creepyPanel');
            if(creepyPanel) return creepyPanel(interaction);
            return;
        }

        if (id === 'modal_convocar_details') {
            const title = interaction.fields.getTextInputValue('title');
            const message = interaction.fields.getTextInputValue('message');
            const image = interaction.fields.getTextInputValue('image');
            const cacheKey = `convocar_${interaction.user.id}`;
            const currentData = TempCache.get(cacheKey) || {};
            TempCache.set(cacheKey, { ...currentData, title, message, image });
            const channelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('select_convocar_channel')
                .setPlaceholder('Selecione o Canal de Voz de destino')
                .setChannelTypes(ChannelType.GuildVoice);
            const row = new ActionRowBuilder().addComponents(channelSelect);
            await interaction.reply({ content: 'ðŸ”Š **Passo 3/3:** Para qual canal de voz eles devem ir?', components: [row], ephemeral: true });
            return;
        }

    } catch (error) {
        Logger.log(`Erro Crítico ModalHandler: ${error.message}`, 'ERROR');
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Erro interno no módulo.', ephemeral: true });
        }
    }
};

modalHandler.openCodeModal = async (i) => {
     const modal = new ModalBuilder().setCustomId('modal_verify_code').setTitle('Inserir código de verificação');
     const code = new TextInputBuilder().setCustomId('code').setLabel('Código de verificação').setStyle(TextInputStyle.Short).setRequired(true);
     modal.addComponents(new ActionRowBuilder().addComponents(code));
     await i.showModal(modal);
};

module.exports = modalHandler;

