const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Config = require('./configManager');
const Logger = require('./logger');
const TicketIntakeAssistant = require('./ticketIntakeAssistant');
const { normalizeRoleIds } = require('./permissionUtils');
const fs = require('fs');
const path = require('path');

const activeTickets = new Map();

const DATA_DIR = path.join(__dirname, '../../data');
const TICKETS_DIR = path.join(DATA_DIR, 'tickets');
const ACTIVE_TICKETS_PATH = path.join(TICKETS_DIR, 'active.json');
const HISTORY_PATH = path.join(TICKETS_DIR, 'history.json');
const TRANSCRIPTS_DIR = path.join(TICKETS_DIR, 'transcripts');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJson(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallbackValue;
        }

        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        Logger.log(`Erro ao ler JSON (${filePath}): ${error.message}`, 'ERROR');
        return fallbackValue;
    }
}

function atomicWriteJson(filePath, data) {
    try {
        ensureDir(path.dirname(filePath));
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        Logger.log(`Erro ao salvar JSON (${filePath}): ${error.message}`, 'ERROR');
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clampText(value, maxLength, fallback = '') {
    const text = String(value ?? '').trim();
    if (!text) {
        return fallback;
    }

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatTicketNumber(ticketNumber) {
    return String(ticketNumber || 0).padStart(4, '0');
}

function buildFixBlock(lines) {
    return ['```fix', ...lines, '```'].join('\n');
}

function getPriorityColor(priority) {
    const normalized = String(priority || 'normal').toLowerCase();
    if (normalized === 'urgent') return '#ED4245';
    if (normalized === 'high') return '#F59E0B';
    if (normalized === 'low') return '#57F287';
    return '#5865F2';
}

function getStatusCode({ status, stage, claimedBy }) {
    const normalizedStage = String(stage || '').toLowerCase();
    if (status === 'closed') return 'CLOSED';
    if (normalizedStage === 'waiting_user') return 'WAITING_USER';
    if (claimedBy) return 'IN_SERVICE';
    return 'WAITING_STAFF';
}

function buildTicketEmbed(ticket, config) {
    const createdAt = ticket.createdAt || Date.now();
    const claimed = Boolean(ticket.claimedBy);
    const priority = String(ticket.priority || 'normal').toLowerCase();
    const stage = String(ticket.stage || (claimed ? 'in_progress' : 'new')).toLowerCase();
    const ticketId = ticket.ticketId || `#${formatTicketNumber(ticket.ticketNumber)}`;

    const statusLabel = ticket.status === 'closed'
        ? '🔒 Encerrado'
        : (stage === 'waiting_user'
            ? '⏸️ Aguardando usuário'
            : (claimed ? '✅ Em atendimento' : '⏳ Aguardando atendimento'));

    const priorityLabel = {
        low: '🟦 Baixa',
        normal: '🟩 Normal',
        high: '🟧 Alta',
        urgent: '🟥 Urgente'
    }[priority] || '🟩 Normal';

    const stageLabel = {
        new: '🆕 Novo',
        in_progress: '🛠️ Em andamento',
        waiting_user: '⏸️ Aguardando usuário'
    }[stage] || '🆕 Novo';

    const intakeConfig = TicketIntakeAssistant.resolveIntakeConfig(config?.intake);
    const intake = ticket.intake || ticket.ai || {};
    const intakeSubmittedAt = intake.submittedAt || intake.intakeSubmittedAt || null;

    const intakeStatus = intakeConfig.enabled
        ? (intakeSubmittedAt ? `✅ Enviado ${`<t:${Math.floor(intakeSubmittedAt / 1000)}:R>`}` : '⏸️ Pendente')
        : '❌ Desativado';

    const statusCode = getStatusCode({ status: ticket.status, stage, claimedBy: ticket.claimedBy });
    const protocol = buildFixBlock([
        `PROTOCOL: ${ticketId}`,
        `STATUS: ${statusCode} | PRIORITY: ${priority.toUpperCase()}`,
        `STAGE: ${stage.toUpperCase()} | INTAKE: ${intakeConfig.enabled ? (intakeSubmittedAt ? 'SUBMITTED' : 'PENDING') : 'DISABLED'}`
    ]);

    const helpText = String(config?.welcomeMessage || 'Descreva sua solicitação com o máximo de detalhes possível.').trim();
    const hints = [];
    if (intakeConfig.enabled && !intakeSubmittedAt) {
        hints.push('🛰️ Clique em **Pré-atendimento** para enviar informações iniciais (acelera muito o atendimento).');
    }
    if (intakeConfig.includeDisclaimer) {
        hints.push('🛡️ Não envie senhas, tokens, dados bancários ou qualquer informação sensível.');
    }

    const description = [protocol, '', helpText, hints.length ? `\n${hints.join('\n')}` : ''].join('\n').trim().slice(0, 4096);

    return new EmbedBuilder()
        .setTitle(`🎫 Ticket Protocol • ${ticketId}`)
        .setDescription(description)
        .addFields(
            { name: '👤 Usuário', value: `<@${ticket.userId}>`, inline: true },
            { name: '🧑‍⚖️ Responsável', value: claimed ? `<@${ticket.claimedBy}>` : '`Não atribuído`', inline: true },
            { name: '⏱️ Abertura', value: `<t:${Math.floor(createdAt / 1000)}:F>`, inline: true },
            {
                name: '🧭 Pipeline',
                value: [
                    `Status: ${statusLabel}`,
                    `Prioridade: ${priorityLabel}`,
                    `Etapa: ${stageLabel}`,
                    `Pré-atendimento: ${intakeStatus}`
                ].join('\n'),
                inline: false
            },
            { name: '🧾 Motivo', value: clampText(ticket.reason, 900, 'Sem motivo informado.'), inline: false },
            { name: '🧩 Descrição', value: clampText(ticket.description, 900, 'Sem descrição adicional.'), inline: false }
        )
        .setColor(getPriorityColor(priority))
        .setFooter({ text: 'Toxic 2.0 • Ticket Protocol' })
        .setTimestamp();
}

function buildPublicTicketComponents(ticket, config) {
    const intakeConfig = TicketIntakeAssistant.resolveIntakeConfig(config?.intake);

    const buttons = [
        new ButtonBuilder()
            .setCustomId('ticket_call_staff')
            .setLabel('Chamar staff')
            .setStyle(ButtonStyle.Secondary)
    ];

    if (intakeConfig.enabled) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('ticket_intake')
                .setLabel('Pré-atendimento')
                .setStyle(ButtonStyle.Primary)
        );
    }

    const row = new ActionRowBuilder().addComponents(buttons.slice(0, 5));
    return [row];
}

function buildStaffTicketComponents(ticket) {
    const claimed = Boolean(ticket?.claimedBy);
    const claimLabel = claimed ? 'Liberar' : 'Assumir';
    const claimId = claimed ? 'ticket_release' : 'ticket_claim';
    const claimStyle = claimed ? ButtonStyle.Secondary : ButtonStyle.Success;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(claimId)
            .setLabel(claimLabel)
            .setStyle(claimStyle),
        new ButtonBuilder()
            .setCustomId('ticket_staff_transcript')
            .setLabel('Transcript')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_staff_notes')
            .setLabel('Notas')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_staff_summary')
            .setLabel('Resumo')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Encerrar')
            .setStyle(ButtonStyle.Danger)
    );

    const priority = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_staff_priority')
            .setPlaceholder('📌 Prioridade')
            .addOptions([
                { label: 'Baixa', value: 'low', emoji: '🟦' },
                { label: 'Normal', value: 'normal', emoji: '🟩' },
                { label: 'Alta', value: 'high', emoji: '🟧' },
                { label: 'Urgente', value: 'urgent', emoji: '🟥' }
            ])
    );

    const stage = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_staff_stage')
            .setPlaceholder('🧭 Etapa')
            .addOptions([
                { label: 'Novo', value: 'new', emoji: '🆕' },
                { label: 'Em andamento', value: 'in_progress', emoji: '🛠️' },
                { label: 'Aguardando usuário', value: 'waiting_user', emoji: '⏸️' }
            ])
    );

    const adminRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_admin_options')
            .setPlaceholder('⚙️ Ações administrativas')
            .addOptions([
                { label: 'Adicionar membro', description: 'Adicionar alguém ao ticket', value: 'admin_add_user', emoji: '➕' },
                { label: 'Remover membro', description: 'Remover acesso de alguém', value: 'admin_remove_user', emoji: '➖' },
                { label: 'Banir membro', description: 'Banir um usuário do servidor', value: 'admin_ban_user', emoji: '⛔' },
                { label: 'Gerar transcript', description: 'Exportar histórico deste ticket', value: 'admin_logs', emoji: '📄' },
                { label: 'Encerrar ticket', description: 'Finalizar e arquivar', value: 'admin_close', emoji: '🔒' }
            ])
    );

    return [row, priority, stage, adminRow];
}

function buildStaffPanelEmbed(ticket) {
    const createdAt = ticket.createdAt || Date.now();
    const claimed = Boolean(ticket.claimedBy);
    const priority = String(ticket.priority || 'normal').toLowerCase();
    const stage = String(ticket.stage || (claimed ? 'in_progress' : 'new')).toLowerCase();
    const ticketId = ticket.ticketId || `#${formatTicketNumber(ticket.ticketNumber)}`;

    const priorityLabel = {
        low: '🟦 Baixa',
        normal: '🟩 Normal',
        high: '🟧 Alta',
        urgent: '🟥 Urgente'
    }[priority] || '🟩 Normal';

    const stageLabel = {
        new: '🆕 Novo',
        in_progress: '🛠️ Em andamento',
        waiting_user: '⏸️ Aguardando usuário'
    }[stage] || '🆕 Novo';

    const intake = ticket.intake || ticket.ai || {};
    const intakeText = intake.text || intake.intake || null;
    const intakeSubmittedAt = intake.submittedAt || intake.intakeSubmittedAt || null;
    const intakeSubmitted = intakeSubmittedAt ? `<t:${Math.floor(intakeSubmittedAt / 1000)}:R>` : '—';
    const intakeUpdated = intake.lastSummaryAt ? `<t:${Math.floor(intake.lastSummaryAt / 1000)}:R>` : '—';
    const notesCount = Array.isArray(ticket.staffNotes) ? ticket.staffNotes.length : 0;
    const keyDetailsText = Array.isArray(intake.keyDetails) && intake.keyDetails.length
        ? intake.keyDetails.slice(0, 6).map(item => `- ${String(item || '').trim()}`).filter(Boolean).join('\n')
        : null;
    const missingInfoText = Array.isArray(intake.missingInfo) && intake.missingInfo.length
        ? intake.missingInfo.slice(0, 6).map(item => `- ${String(item || '').trim()}`).filter(Boolean).join('\n')
        : null;
    const nextStepsText = Array.isArray(intake.nextStepsStaff) && intake.nextStepsStaff.length
        ? intake.nextStepsStaff.slice(0, 6).map(item => `- ${String(item || '').trim()}`).filter(Boolean).join('\n')
        : null;

    const statusCode = getStatusCode({ status: ticket.status, stage, claimedBy: ticket.claimedBy });
    const intakeCode = intakeText ? 'SUBMITTED' : (intake.enabled === false ? 'DISABLED' : 'PENDING');
    const consoleBlock = buildFixBlock([
        'STAFF_CONSOLE: ONLINE',
        `PROTOCOL: ${ticketId}`,
        `STATUS: ${statusCode} | PRIORITY: ${priority.toUpperCase()}`,
        `STAGE: ${stage.toUpperCase()} | INTAKE: ${intakeCode} | NOTES: ${notesCount}`
    ]);

    const intakeStatusLabel = intakeText ? `✅ Enviado ${intakeSubmitted}` : (intake.enabled === false ? '❌ Desativado' : '⏸️ Pendente');
    const intakeSummary = clampText(intake.summary, 950, '`Sem resumo ainda`');

    const embed = new EmbedBuilder()
        .setTitle(`🛡️ Staff Console • ${ticketId}`)
        .setDescription([consoleBlock, '', 'Use os botões abaixo para ações rápidas (assumir, transcript, notas, encerrar).'].join('\n').slice(0, 4096))
        .addFields(
            { name: '👤 Usuário', value: `<@${ticket.userId}>`, inline: true },
            { name: '🧑‍⚖️ Responsável', value: claimed ? `<@${ticket.claimedBy}>` : '`Não atribuído`', inline: true },
            { name: '⏱️ Abertura', value: `<t:${Math.floor(createdAt / 1000)}:F>`, inline: true },
            {
                name: '🧭 Estado',
                value: [
                    `Status: ${ticket.status === 'closed' ? '🔒 Encerrado' : (claimed ? '✅ Em atendimento' : '⏳ Aguardando atendimento')}`,
                    `Prioridade: ${priorityLabel}`,
                    `Etapa: ${stageLabel}`,
                    `Pré-atendimento: ${intakeStatusLabel}`,
                    `Última atualização: ${intakeUpdated}`
                ].join('\n'),
                inline: false
            },
            { name: '🧾 Motivo', value: clampText(ticket.reason, 900, 'Sem motivo informado.'), inline: false },
            { name: '🧩 Descrição', value: clampText(ticket.description, 900, 'Sem descrição adicional.'), inline: false },
            { name: '📌 Resumo (pré-atendimento)', value: intakeSummary, inline: false }
        )
        .setColor(getPriorityColor(priority))
        .setFooter({ text: 'Toxic 2.0 • Staff Console' })
        .setTimestamp();

    if (keyDetailsText) {
        embed.addFields({ name: 'Pontos-chave', value: clampText(keyDetailsText, 950, '—'), inline: false });
    }

    if (missingInfoText) {
        embed.addFields({ name: 'Faltando', value: clampText(missingInfoText, 950, '—'), inline: false });
    }

    if (nextStepsText) {
        embed.addFields({ name: 'Próximos passos', value: clampText(nextStepsText, 950, '—'), inline: false });
    }

    return embed;
}

async function syncTicketMessages(channel, ticket, config) {
    if (!channel || !ticket) return;

    const ticketOwner = await channel.client.users.fetch(ticket.userId).catch(() => null);
    const avatarUrl = ticketOwner?.displayAvatarURL?.() || null;

    const publicEmbed = buildTicketEmbed(ticket, config);
    if (avatarUrl) publicEmbed.setThumbnail(avatarUrl);
    const publicComponents = buildPublicTicketComponents(ticket, config);

    const staffEmbed = buildStaffPanelEmbed(ticket);
    if (avatarUrl) staffEmbed.setThumbnail(avatarUrl);
    const staffComponents = buildStaffTicketComponents(ticket);

    if (ticket.initialMessageId) {
        const publicMessage = await channel.messages.fetch(ticket.initialMessageId).catch(() => null);
        if (publicMessage) {
            await publicMessage.edit({ embeds: [publicEmbed], components: publicComponents }).catch(() => {});
        }
    }

    if (ticket.staffPanelMessageId) {
        const staffMessage = await channel.messages.fetch(ticket.staffPanelMessageId).catch(() => null);
        if (staffMessage) {
            await staffMessage.edit({ embeds: [staffEmbed], components: staffComponents }).catch(() => {});
        }
    }
}

function normalizeTicketSchema(ticket) {
    if (!ticket || typeof ticket !== 'object') {
        return ticket;
    }

    if (!ticket.priority) {
        ticket.priority = 'normal';
    }

    if (!ticket.stage) {
        ticket.stage = ticket.claimedBy ? 'in_progress' : 'new';
    }

    if (!Array.isArray(ticket.staffNotes)) {
        ticket.staffNotes = [];
    }

    if (!ticket.intake && ticket.ai && typeof ticket.ai === 'object') {
        ticket.intake = {
            enabled: Boolean(ticket.ai.enabled),
            text: ticket.ai.intake || null,
            submittedAt: ticket.ai.intakeSubmittedAt || null,
            category: ticket.ai.category || null,
            priority: ticket.ai.priority || null,
            summary: ticket.ai.summary || null,
            keyDetails: Array.isArray(ticket.ai.keyDetails) ? ticket.ai.keyDetails : [],
            missingInfo: Array.isArray(ticket.ai.missingInfo) ? ticket.ai.missingInfo : [],
            nextStepsStaff: Array.isArray(ticket.ai.nextStepsStaff) ? ticket.ai.nextStepsStaff : [],
            suggestedReplyToUser: ticket.ai.suggestedReplyToUser || null,
            lastSummaryAt: ticket.ai.lastSummaryAt || null
        };
    }

    if (!ticket.intake || typeof ticket.intake !== 'object') {
        ticket.intake = {
            enabled: false,
            text: null,
            submittedAt: null,
            category: null,
            priority: null,
            summary: null,
            keyDetails: [],
            missingInfo: [],
            nextStepsStaff: [],
            suggestedReplyToUser: null,
            lastSummaryAt: null
        };
    }

    if (!Array.isArray(ticket.intake.keyDetails)) ticket.intake.keyDetails = [];
    if (!Array.isArray(ticket.intake.missingInfo)) ticket.intake.missingInfo = [];
    if (!Array.isArray(ticket.intake.nextStepsStaff)) ticket.intake.nextStepsStaff = [];

    if (!ticket.intake.text && ticket.intake.intake) {
        ticket.intake.text = ticket.intake.intake;
    }

    if (!ticket.intake.submittedAt && ticket.intake.intakeSubmittedAt) {
        ticket.intake.submittedAt = ticket.intake.intakeSubmittedAt;
    }

    if (!ticket.intakeMessageId && ticket.aiMessageId) {
        ticket.intakeMessageId = ticket.aiMessageId;
    }

    return ticket;
}

function loadActiveTickets() {
    const data = readJson(ACTIVE_TICKETS_PATH, {});
    if (!data || typeof data !== 'object') {
        return;
    }

    for (const [key, value] of Object.entries(data)) {
        activeTickets.set(key, normalizeTicketSchema(value));
    }
}

function saveActiveTickets() {
    const data = Object.fromEntries(activeTickets);
    atomicWriteJson(ACTIVE_TICKETS_PATH, data);
}

function loadTicketHistory() {
    const history = readJson(HISTORY_PATH, []);
    return Array.isArray(history) ? history : [];
}

function saveTicketHistory(history) {
    atomicWriteJson(HISTORY_PATH, Array.isArray(history) ? history : []);
}

function upsertHistoryEntry(entry) {
    const history = loadTicketHistory();
    const index = history.findIndex(item => item.ticketId === entry.ticketId);

    if (index === -1) {
        history.unshift(entry);
    } else {
        history[index] = { ...history[index], ...entry };
    }

    saveTicketHistory(history.slice(0, 1000));
}

function getHistoryEntry(ticketId) {
    return loadTicketHistory().find(entry => entry.ticketId === ticketId) || null;
}

function updateUserFeedback(ticketId, userId, patch) {
    const history = loadTicketHistory();
    const index = history.findIndex(entry => entry.ticketId === ticketId);
    if (index === -1) {
        return { ok: false, message: 'Ticket não encontrado no histórico.' };
    }

    if (history[index].userId && history[index].userId !== userId) {
        return { ok: false, message: 'Este feedback não pertence a você.' };
    }

    const currentFeedback = history[index].userFeedback || {};
    history[index].userFeedback = { ...currentFeedback, ...patch, submittedAt: Date.now() };
    saveTicketHistory(history);
    return { ok: true, entry: history[index] };
}

function getTranscriptFile(ticketId) {
    const entry = getHistoryEntry(ticketId);
    if (!entry?.transcriptFile) {
        return null;
    }

    const filePath = path.join(TRANSCRIPTS_DIR, entry.transcriptFile);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    return {
        entry,
        fileName: entry.transcriptFile,
        buffer: fs.readFileSync(filePath)
    };
}

loadActiveTickets();

module.exports = {
    activeTickets,
    getHistoryEntry,
    loadTicketHistory,
    getTranscriptFile,
    updateUserFeedback,
    persistActiveTickets: saveActiveTickets,

    async refreshTicket(channel) {
        const ticket = activeTickets.get(channel?.id);
        if (!ticket) return false;
        const config = this.getTicketConfig();
        await syncTicketMessages(channel, ticket, config);
        return true;
    },

    addStaffNote(channelId, authorId, content) {
        const ticket = activeTickets.get(channelId);
        if (!ticket) return { ok: false, message: 'Ticket não encontrado.' };

        const trimmed = String(content || '').trim();
        if (!trimmed) return { ok: false, message: 'Nota vazia.' };

        if (!Array.isArray(ticket.staffNotes)) ticket.staffNotes = [];
        ticket.staffNotes.unshift({
            id: `note_${Date.now()}`,
            authorId,
            content: trimmed.slice(0, 1500),
            createdAt: Date.now()
        });

        ticket.staffNotes = ticket.staffNotes.slice(0, 50);

        activeTickets.set(channelId, ticket);
        saveActiveTickets();
        return { ok: true, ticket };
    },

    getTicketConfig() {
        const config = Config.get('tickets') || {};
        const intakeRaw = (config && typeof config === 'object' && (config.intake || config.ai)) || {};
        return {
            categoryId: '',
            logsChannelId: '',
            supportRoleId: '',
            maxTicketsPerUser: 1,
            closeConfirmation: true,
            welcomeMessage: 'Descreva sua solicitação com detalhes para agilizar o atendimento.',
            ...config,
            intake: {
                enabled: true,
                autoWelcome: true,
                includeDisclaimer: true,
                ...(intakeRaw && typeof intakeRaw === 'object' ? intakeRaw : {})
            }
        };
    },

    async createTicket(guild, user, reason = 'Sem motivo especificado', description = '') {
        try {
            const config = this.getTicketConfig();
            
            const userTickets = Array.from(activeTickets.values()).filter(t => t.userId === user.id && t.status === 'open');
            if (userTickets.length >= (config.maxTicketsPerUser || 1)) {
                return { success: false, message: `Você já possui ${userTickets.length} ticket(s) ativo(s). Finalize antes de abrir outro.` };
            }

            const ticketCounter = Number(Config.get('tickets.counter') || 0);
            const ticketNumber = Number.isFinite(ticketCounter) ? ticketCounter + 1 : 1;
            Config.set('tickets.counter', ticketNumber);

            const channelName = `ticket-${ticketNumber.toString().padStart(4, '0')}`;
            const ticketId = `T2-${String(ticketNumber).padStart(5, '0')}`;

            const permissionOverwrites = [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
            ];

            if (config.supportRoleId) {
                permissionOverwrites.push({
                    id: config.supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                });
            }

            const staffRoleIds = normalizeRoleIds(Config.get('roles.staff'));
            for (const staffRoleId of staffRoleIds) {
                if (!staffRoleId || staffRoleId === config.supportRoleId) {
                    continue;
                }

                permissionOverwrites.push({
                    id: staffRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                });
            }

            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: config.categoryId || null,
                permissionOverwrites
            });

            const ticketData = {
                ticketId,
                ticketNumber,
                channelId: ticketChannel.id,
                guildId: guild.id,
                userId: user.id,
                userTag: user.tag,
                reason: reason,
                description: description,
                status: 'open',
                createdAt: Date.now(),
                claimedBy: null,
                priority: 'normal',
                stage: 'new',
                initialMessageId: null,
                staffPanelMessageId: null,
                intakeMessageId: null,
                staffNotes: [],
                intake: {
                    enabled: false,
                    text: null,
                    submittedAt: null,
                    category: null,
                    priority: null,
                    summary: null,
                    keyDetails: [],
                    missingInfo: [],
                    nextStepsStaff: [],
                    suggestedReplyToUser: null,
                    lastSummaryAt: null
                },
                lastCallAt: null
            };

            activeTickets.set(ticketChannel.id, ticketData);
            saveActiveTickets();

            const reasonText = String(reason || '').trim().slice(0, 900) || 'Sem motivo informado.';

            const contentParts = [`<@${user.id}>`];
            if (config.supportRoleId) {
                contentParts.push(`<@&${config.supportRoleId}>`);
            }

            const publicEmbed = buildTicketEmbed(ticketData, config).setThumbnail(user.displayAvatarURL());
            const publicComponents = buildPublicTicketComponents(ticketData, config);

            const publicMessage = await ticketChannel.send({
                content: contentParts.join(' • '),
                embeds: [publicEmbed],
                components: publicComponents,
                allowedMentions: {
                    users: [user.id],
                    roles: config.supportRoleId ? [config.supportRoleId] : []
                }
            });

            ticketData.initialMessageId = publicMessage.id;

            const staffEmbed = buildStaffPanelEmbed(ticketData).setThumbnail(user.displayAvatarURL());
            const staffComponents = buildStaffTicketComponents(ticketData);
            const staffMessage = await ticketChannel.send({ embeds: [staffEmbed], components: staffComponents }).catch(() => null);
            if (staffMessage) {
                ticketData.staffPanelMessageId = staffMessage.id;
            }

            const intakeConfig = TicketIntakeAssistant.resolveIntakeConfig(config.intake);
            ticketData.intake.enabled = Boolean(intakeConfig.enabled);

            if (intakeConfig.enabled) {
                if (intakeConfig.autoWelcome) {
                    if (ticketData.stage === 'new') {
                        ticketData.stage = 'waiting_user';
                    }

                    const welcome = TicketIntakeAssistant.buildWelcome({ ticket: ticketData });
                    const checklist = Array.isArray(welcome.checklist) ? welcome.checklist : [];
                    const questions = Array.isArray(welcome.questions) ? welcome.questions : [];

                    const lines = [
                        welcome.intro || 'Vamos coletar algumas informações para agilizar o atendimento.',
                        '',
                        '**Checklist rápido**',
                        ...checklist.slice(0, 4).map(item => `- ${item}`),
                        '',
                        '**Perguntas (responda no formulário)**',
                        ...questions.slice(0, 4).map((q, index) => `${index + 1}. ${q}`)
                    ];

                    if (intakeConfig.includeDisclaimer) {
                        lines.push('', '_Não envie senhas, tokens ou dados sensíveis._');
                    }

                    const intakeHeader = buildFixBlock([
                        'PRE_ATTENDANCE: ACTIVE',
                        `PROTOCOL: ${ticketId}`,
                        'MODE: COLLECT_ONLY'
                    ]);

                    const intakeDescription = [intakeHeader, '', ...lines].join('\n').slice(0, 4096);

                    const intakeEmbed = new EmbedBuilder()
                        .setTitle(welcome.title || '🛰️ Pré-atendimento • Coleta inicial')
                        .setDescription(intakeDescription)
                        .setColor('#5865F2')
                        .setFooter({ text: 'Toxic 2.0 • Pré-atendimento' });

                    const intakeRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_intake')
                            .setLabel('Responder pré-atendimento')
                            .setStyle(ButtonStyle.Primary)
                    );

                    const intakeMessage = await ticketChannel.send({ embeds: [intakeEmbed], components: [intakeRow] }).catch(() => null);
                    if (intakeMessage) {
                        ticketData.intakeMessageId = intakeMessage.id;
                    }
                }
            }

            activeTickets.set(ticketChannel.id, ticketData);
            saveActiveTickets();

            if (config.logsChannelId) {
                const logsChannel = guild.channels.cache.get(config.logsChannelId) || await guild.channels.fetch(config.logsChannelId).catch(() => null);
                if (logsChannel) {
                    const createdBlock = buildFixBlock([
                        'TICKET_EVENT: CREATED',
                        `PROTOCOL: ${ticketId}`,
                        `CHANNEL: #${ticketChannel.name}`,
                        `USER: ${user.tag}`
                    ]);

                    const createdEmbed = new EmbedBuilder()
                        .setTitle('🛰️ Ticket Event • CREATED')
                        .setDescription(createdBlock)
                        .addFields(
                            { name: 'Ticket', value: `\`${ticketId}\``, inline: true },
                            { name: 'Canal', value: `<#${ticketChannel.id}>`, inline: true },
                            { name: 'Usuário', value: `<@${user.id}>`, inline: true },
                            { name: 'Motivo', value: clampText(reasonText, 900, 'Sem motivo informado.'), inline: false }
                        )
                        .setColor(getPriorityColor('normal'))
                        .setFooter({ text: 'Toxic 2.0 • Ticket Logs' })
                        .setTimestamp();

                    await logsChannel.send({ embeds: [createdEmbed] }).catch(() => {});
                }
            }

            try {
                const dmBlock = buildFixBlock([
                    'TICKET_PROTOCOL: CREATED',
                    `PROTOCOL: ${ticketId}`,
                    `CHANNEL: #${ticketChannel.name}`,
                    `GUILD: ${guild.name}`
                ]);

                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🎫 Ticket Protocol • ${ticketId}`)
                    .setDescription(
                        [
                            dmBlock,
                            '',
                            'Seu ticket foi criado com sucesso. Use o canal abaixo para falar com a staff.',
                            '🛰️ Se disponível, preencha o **Pré-atendimento** para acelerar o atendimento.'
                        ].join('\n').slice(0, 4096)
                    )
                    .addFields(
                        { name: 'Canal', value: `<#${ticketChannel.id}>`, inline: true },
                        { name: 'Servidor', value: guild.name, inline: true }
                    )
                    .setColor('#5865F2')
                    .setFooter({ text: 'Toxic 2.0 • Ticket Protocol' })
                    .setTimestamp();

                await user.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {}

            return { success: true, channel: ticketChannel, ticketNumber, ticketId };

        } catch (error) {
            Logger.log(`Erro ao criar ticket: ${error.message}`, 'ERROR');
            return { success: false, message: 'Erro interno ao abrir o ticket.' };
        }
    },

    async claimTicket(channel, staff) {
        const ticket = activeTickets.get(channel.id);
        if (!ticket) return { success: false, message: 'Ticket não encontrado.' };
        if (ticket.claimedBy) return { success: false, message: `Este ticket já foi assumido por <@${ticket.claimedBy}>.` };

        ticket.claimedBy = staff.id;
        ticket.stage = 'in_progress';
        activeTickets.set(channel.id, ticket);
        saveActiveTickets();

        const config = this.getTicketConfig();
        await syncTicketMessages(channel, ticket, config);

        const safeTicketId = ticket.ticketId || channel.name.toUpperCase();
        const claimBlock = buildFixBlock([
            'TICKET_EVENT: CLAIMED',
            `PROTOCOL: ${safeTicketId}`,
            `CLAIMED_BY: ${staff.tag}`
        ]);

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛰️ Ticket Event • CLAIMED')
                    .setDescription(claimBlock)
                    .setColor('#57F287')
            ]
        }).catch(() => {});

        try {
            const ticketOwner = await channel.client.users.fetch(ticket.userId).catch(() => null);
            if (ticketOwner) {
                const dmBlock = buildFixBlock([
                    'TICKET_PROTOCOL: UPDATE',
                    `PROTOCOL: ${safeTicketId}`,
                    `CLAIMED_BY: ${staff.tag}`
                ]);

                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🎫 Ticket Protocol • ${safeTicketId}`)
                    .setDescription(
                        [
                            dmBlock,
                            '',
                            `Seu ticket foi assumido por **${staff.tag}**.`
                        ].join('\n').slice(0, 4096)
                    )
                    .addFields({ name: 'Canal', value: `<#${channel.id}>`, inline: true })
                    .setColor('#5865F2')
                    .setFooter({ text: 'Toxic 2.0 • Ticket Protocol' })
                    .setTimestamp();

                await ticketOwner.send({ embeds: [dmEmbed] }).catch(() => {});
            }
        } catch (e) {}

        return { success: true };
    },

    async releaseTicket(channel, staff) {
        const ticket = activeTickets.get(channel.id);
        if (!ticket) return { success: false, message: 'Ticket não encontrado.' };
        if (!ticket.claimedBy) return { success: false, message: 'Este ticket não está assumido.' };

        ticket.claimedBy = null;
        ticket.stage = 'new';
        activeTickets.set(channel.id, ticket);
        saveActiveTickets();

        const config = this.getTicketConfig();
        await syncTicketMessages(channel, ticket, config);

        const safeTicketId = ticket.ticketId || channel.name.toUpperCase();
        const releaseBlock = buildFixBlock([
            'TICKET_EVENT: RELEASED',
            `PROTOCOL: ${safeTicketId}`,
            `RELEASED_BY: ${staff.tag}`
        ]);

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛰️ Ticket Event • RELEASED')
                    .setDescription(releaseBlock)
                    .setColor('#5865F2')
            ]
        }).catch(() => {});

        return { success: true };
    },

    async closeTicket(channel, closer, client, options = {}) {
        const ticket = activeTickets.get(channel.id);
        if (!ticket) return { success: false, message: 'Ticket não encontrado.' };

        const safeTicketId = ticket.ticketId || channel.name.toUpperCase();

        const resolvedByStaff = Object.prototype.hasOwnProperty.call(options, 'resolvedByStaff')
            ? Boolean(options.resolvedByStaff)
            : null;

        ticket.status = 'closed';
        ticket.closedAt = Date.now();
        ticket.closedBy = closer.id;
        ticket.resolvedByStaff = resolvedByStaff;

        const config = this.getTicketConfig();
        const transcript = await this.generateTranscript(channel, ticket);

        let transcriptFileName = null;
        if (transcript) {
            ensureDir(TRANSCRIPTS_DIR);
            transcriptFileName = `${safeTicketId}.html`;
            fs.writeFileSync(path.join(TRANSCRIPTS_DIR, transcriptFileName), transcript);
        }

        upsertHistoryEntry({
            ticketId: safeTicketId,
            ticketNumber: ticket.ticketNumber || null,
            channelId: channel.id,
            channelName: channel.name,
            guildId: ticket.guildId || channel.guild?.id || null,
            userId: ticket.userId,
            userTag: ticket.userTag,
            reason: ticket.reason,
            description: ticket.description,
            priority: ticket.priority || null,
            stage: ticket.stage || null,
            createdAt: ticket.createdAt,
            closedAt: ticket.closedAt,
            claimedBy: ticket.claimedBy || null,
            closedBy: ticket.closedBy,
            resolvedByStaff,
            transcriptFile: transcriptFileName,
            staffNotes: Array.isArray(ticket.staffNotes) ? ticket.staffNotes : null,
            intake: (ticket.intake || ticket.ai) ? (() => {
                const intake = ticket.intake || ticket.ai;
                return {
                    enabled: Boolean(intake.enabled),
                    text: intake.text || intake.intake || null,
                    submittedAt: intake.submittedAt || intake.intakeSubmittedAt || null,
                    category: intake.category || null,
                    priority: intake.priority || null,
                    summary: intake.summary || null,
                    keyDetails: Array.isArray(intake.keyDetails) ? intake.keyDetails : [],
                    missingInfo: Array.isArray(intake.missingInfo) ? intake.missingInfo : [],
                    nextStepsStaff: Array.isArray(intake.nextStepsStaff) ? intake.nextStepsStaff : [],
                    suggestedReplyToUser: intake.suggestedReplyToUser || null,
                    lastSummaryAt: intake.lastSummaryAt || null
                };
            })() : null,
            userFeedback: ticket.userFeedback || null
        });

        if (config.logsChannelId) {
            try {
                const logsChannel = await client.channels.fetch(config.logsChannelId).catch(() => null);
                if (logsChannel) {
                    const resolutionLabel = resolvedByStaff === null ? 'Não informado' : (resolvedByStaff ? 'Resolvido' : 'Não resolvido');
                    const logBlock = buildFixBlock([
                        'TICKET_EVENT: CLOSED',
                        `PROTOCOL: ${safeTicketId}`,
                        `RESOLUTION: ${resolutionLabel.toUpperCase().replace(/\s+/g, '_')}`,
                        `CLOSED_BY: ${closer.tag}`
                    ]);

                    const logEmbed = new EmbedBuilder()
                        .setTitle('🛰️ Ticket Event • CLOSED')
                        .setDescription(logBlock)
                        .addFields(
                            { name: 'Canal', value: `#${channel.name}`, inline: true },
                            { name: 'Usuário', value: `<@${ticket.userId}>`, inline: true },
                            { name: 'Assumido por', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '`Não atribuído`', inline: true },
                            { name: 'Encerrado por', value: `<@${closer.id}>`, inline: true },
                            { name: 'Resolução (staff)', value: resolutionLabel, inline: true },
                            { name: 'Criado em', value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: true },
                            { name: 'Encerrado em', value: `<t:${Math.floor(ticket.closedAt / 1000)}:F>`, inline: true },
                            { name: 'Motivo', value: clampText(ticket.reason, 900, 'Sem motivo informado.'), inline: false }
                        )
                        .setColor(getPriorityColor(ticket.priority || 'normal'))
                        .setFooter({ text: 'Toxic 2.0 • Ticket Logs' })
                        .setTimestamp();

                    const files = [];
                    if (transcript && transcriptFileName) {
                        const { AttachmentBuilder } = require('discord.js');
                        files.push(new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: transcriptFileName }));
                    }

                    await logsChannel.send({ embeds: [logEmbed], files }).catch(() => {});
                }
            } catch (e) {
                Logger.log(`Erro ao enviar log de ticket: ${e.message}`, 'ERROR');
            }
        }

        try {
            const user = await client.users.fetch(ticket.userId).catch(() => null);
            if (user) {
                const feedbackBlock = buildFixBlock([
                    'TICKET_PROTOCOL: CLOSED',
                    `PROTOCOL: ${safeTicketId}`,
                    `CLOSED_BY: ${closer.tag}`,
                    `CLAIMED_BY: ${ticket.claimedBy ? ticket.claimedBy : 'UNASSIGNED'}`
                ]);

                const feedbackEmbed = new EmbedBuilder()
                    .setTitle(`🎫 Ticket Protocol • ${safeTicketId}`)
                    .setDescription(
                        [
                            feedbackBlock,
                            '',
                            'Seu ticket foi encerrado. Se quiser, deixe um feedback rápido para melhorar o atendimento.'
                        ].join('\n').slice(0, 4096)
                    )
                    .addFields(
                        { name: 'Encerrado por', value: closer.tag, inline: true },
                        { name: 'Responsável', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '`Não atribuído`', inline: true }
                    )
                    .setColor(getPriorityColor(ticket.priority || 'normal'))
                    .setFooter({ text: 'Toxic 2.0 • Ticket Protocol' })
                    .setTimestamp();

                const rateRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${safeTicketId}:1`).setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${safeTicketId}:2`).setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${safeTicketId}:3`).setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${safeTicketId}:4`).setEmoji('⭐').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`ticket_feedback_rate:${safeTicketId}:5`).setEmoji('⭐').setStyle(ButtonStyle.Secondary)
                );

                const resolvedRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`ticket_feedback_resolved:${safeTicketId}:yes`).setLabel('Resolvido').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`ticket_feedback_resolved:${safeTicketId}:no`).setLabel('Não resolvido').setStyle(ButtonStyle.Danger)
                );

                await user.send({
                    content: 'Como foi o atendimento? (opcional)',
                    embeds: [feedbackEmbed],
                    components: [rateRow, resolvedRow]
                }).catch(() => {});
            }
        } catch (e) {}

        activeTickets.delete(channel.id);
        saveActiveTickets();

        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (e) {}
        }, 5000);

        return { success: true, ticketId: safeTicketId, transcriptFileName };
    },

    async generateTranscript(channel, ticket = null) {
        try {
            let messages = [];
            let lastId;

            while (true) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const fetched = await channel.messages.fetch(options);
                if (fetched.size === 0) break;

                messages = messages.concat(Array.from(fetched.values()));
                lastId = fetched.last().id;

                if (fetched.size < 100) break;
            }

            messages = messages.reverse();

            const safeTicketId = ticket?.ticketId || channel.name;
            const safeGuild = channel.guild?.name || 'Desconhecido';
            const openedAt = ticket?.createdAt ? new Date(ticket.createdAt).toLocaleString('pt-BR') : 'N/A';
            const closedAt = ticket?.closedAt ? new Date(ticket.closedAt).toLocaleString('pt-BR') : 'N/A';

            let html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Transcript - ${escapeHtml(safeTicketId)}</title>
    <style>
        body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; background: #0b1020; color: #e6e8ef; padding: 24px; line-height: 1.45; }
        .header { border: 1px solid #1f2d4d; border-radius: 12px; padding: 16px 18px; background: #0f1730; margin-bottom: 18px; }
        .title { font-size: 18px; font-weight: 700; letter-spacing: 0.2px; }
        .meta { margin-top: 8px; font-size: 12px; color: #a7b0c4; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; }
        .meta code { color: #d6d9e6; background: #111a35; padding: 2px 6px; border-radius: 8px; }
        .messages { display: flex; flex-direction: column; gap: 10px; }
        .message { border-left: 3px solid #5865F2; background: #101a33; padding: 12px 14px; border-radius: 10px; }
        .message .top { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
        .author { font-weight: 700; color: #ffffff; }
        .timestamp { font-size: 12px; color: #a7b0c4; }
        .content { margin-top: 8px; white-space: pre-wrap; color: #e6e8ef; }
        .attachments { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
        .attachment { font-size: 12px; color: #9fb0ff; text-decoration: none; border: 1px solid #26335c; padding: 6px 8px; border-radius: 10px; background: #0f1730; }
        .footer { margin-top: 22px; font-size: 12px; color: #a7b0c4; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Transcript • ${escapeHtml(safeTicketId)}</div>
        <div class="meta">
            <div>Servidor: <code>${escapeHtml(safeGuild)}</code></div>
            <div>Canal: <code>#${escapeHtml(channel.name)}</code></div>
            <div>Abertura: <code>${escapeHtml(openedAt)}</code></div>
            <div>Encerramento: <code>${escapeHtml(closedAt)}</code></div>
        </div>
    </div>
    <div class="messages">
`;

            for (const msg of messages) {
                const time = new Date(msg.createdTimestamp).toLocaleString('pt-BR');
                const content = escapeHtml(msg.content || '');
                const attachments = msg.attachments.map(attachment => (
                    `<a class="attachment" href="${escapeHtml(attachment.url)}">📎 ${escapeHtml(attachment.name || 'arquivo')}</a>`
                )).join('');

                html += `
        <div class="message">
            <div class="top">
                <div class="author">${escapeHtml(msg.author.tag)}</div>
                <div class="timestamp">${escapeHtml(time)}</div>
            </div>
            <div class="content">${content}</div>
            ${attachments ? `<div class="attachments">${attachments}</div>` : ''}
        </div>`;
            }

            html += `
    </div>
    <div class="footer">Gerado por Toxic 2.0 • ${escapeHtml(new Date().toLocaleString('pt-BR'))}</div>
</body>
</html>`;

            return html;
        } catch (e) {
            Logger.log(`Erro ao gerar transcript: ${e.message}`, 'ERROR');
            return null;
        }
    },

    async sendTicketPanel(channel, config = {}) {
        const intakeEnabled = Config.get('tickets.intake.enabled') !== false;
        const consoleBlock = buildFixBlock([
            'SUPPORT_CONSOLE: ONLINE',
            `PRE_ATTENDANCE: ${intakeEnabled ? 'ENABLED' : 'DISABLED'}`,
            'TICKETS: PRIVATE_CHANNELS'
        ]);

        const embed = new EmbedBuilder()
            .setTitle('🛰️ Central de Suporte • Console')
            .setDescription(
                [
                    consoleBlock,
                    '',
                    'Clique em **Abrir ticket** para gerar um canal privado com a staff.',
                    intakeEnabled
                        ? '🛰️ O **Pré-atendimento** coleta dados iniciais e acelera a resposta.'
                        : '🛰️ Pré-atendimento está desativado (ativável em `/botconfig` → Tickets).'
                ].join('\n').slice(0, 4096)
            )
            .setColor('#5865F2')
            .addFields(
                { name: '🔒 Privacidade', value: 'Visível apenas para você e a staff.', inline: true },
                { name: '🧾 Boas práticas', value: 'Inclua prints/links e passos para reproduzir.', inline: true }
            )
            .setFooter({ text: 'Toxic 2.0 • Support Console' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_open')
                .setLabel('Abrir ticket')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎫'),
            new ButtonBuilder()
                .setCustomId('ticket_view_all')
                .setLabel('Histórico (staff)')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );

        return channel.send({ embeds: [embed], components: [row] });
    }
};

