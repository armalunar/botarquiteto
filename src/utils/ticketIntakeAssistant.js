const DEFAULT_INTAKE_CONFIG = {
    enabled: true,
    autoWelcome: true,
    includeDisclaimer: true
};

function resolveIntakeConfig(intakeConfig = {}) {
    const config = intakeConfig && typeof intakeConfig === 'object' ? intakeConfig : {};
    return {
        ...DEFAULT_INTAKE_CONFIG,
        ...config
    };
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
}

function detectCategory(text, explicitTopic = '') {
    const topic = normalizeText(explicitTopic);
    if (topic) {
        if (topic.includes('denunc') || topic.includes('report') || topic.includes('mod')) return 'report';
        if (topic.includes('bug') || topic.includes('erro') || topic.includes('falha')) return 'bug';
        if (topic.includes('parceria') || topic.includes('partner')) return 'partnership';
        if (topic.includes('pag') || topic.includes('pix') || topic.includes('reembolso')) return 'billing';
        if (topic.includes('suporte') || topic.includes('duvida') || topic.includes('dúvida')) return 'support';
    }

    const t = normalizeText(text);
    const matches = (needles) => needles.some(needle => t.includes(needle));

    if (matches(['denuncia', 'denuncia', 'report', 'ban', 'amea', 'assedio', 'racismo', 'tox', 'abuso'])) {
        return 'report';
    }

    if (matches(['bug', 'erro', 'crash', 'falha', 'nao funciona', 'nao abre', 'não funciona', 'quebra'])) {
        return 'bug';
    }

    if (matches(['parceria', 'partner', 'publi', 'patrocin', 'anuncio', 'anúncio'])) {
        return 'partnership';
    }

    if (matches(['pagamento', 'pix', 'compra', 'reembolso', 'cobranca', 'cobrança', 'chargeback'])) {
        return 'billing';
    }

    return 'support';
}

function detectPriority(text) {
    const t = normalizeText(text);

    const matches = (needles) => needles.some(needle => t.includes(needle));
    if (matches(['urgente', 'imediat', 'hack', 'invadi', 'roubo', 'phishing', 'dox', 'amea', 'exploit'])) {
        return 'urgent';
    }

    if (matches(['hoje', 'agora', 'rapido', 'rápido', 'critico', 'crítico', 'grave'])) {
        return 'high';
    }

    return 'normal';
}

function extractLinks(text) {
    const raw = String(text || '');
    const matches = raw.match(/https?:\/\/\S+/gi) || [];
    const cleaned = matches
        .map(item => item.replace(/[)>.,;]+$/g, '').trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned)).slice(0, 10);
}

function extractDiscordIds(text) {
    const raw = String(text || '');
    const matches = raw.match(/\b\d{17,20}\b/g) || [];
    return Array.from(new Set(matches)).slice(0, 20);
}

function formatCategoryLabel(category) {
    return {
        support: '🧩 Suporte',
        bug: '🧪 Bug',
        report: '🛡️ Denúncia/Moderação',
        partnership: '🤝 Parceria',
        billing: '💳 Financeiro',
        other: '📦 Outro'
    }[category] || '🧩 Suporte';
}

function formatPriorityLabel(priority) {
    return {
        low: '🟦 Baixa',
        normal: '🟩 Normal',
        high: '🟧 Alta',
        urgent: '🟥 Urgente'
    }[priority] || '🟩 Normal';
}

function buildWelcome({ ticket }) {
    const baseText = `${ticket?.reason || ''}\n${ticket?.description || ''}`.trim();
    const category = detectCategory(baseText);
    const categoryLabel = formatCategoryLabel(category);

    return {
        title: '🛰️ Pré-atendimento • Coleta inicial',
        intro: `Vou coletar algumas informações rápidas para a staff te atender com máxima velocidade.\nCategoria sugerida: **${categoryLabel}**.`,
        checklist: [
            'Descreva o objetivo (o que você quer que aconteça).',
            'Se for bug: inclua passos para reproduzir + prints/links.',
            'Se for denúncia: inclua IDs, provas e horários aproximados.'
        ],
        questions: [
            'O que aconteceu e o que você precisa exatamente?',
            'Quando começou / como reproduzir?',
            'O que você já tentou e quais evidências você tem?'
        ]
    };
}

function buildSummary({ ticket, intakeText }) {
    const intake = String(intakeText || '').trim();
    const topicMatch = intake.match(/^\s*Tipo:\s*(.+)$/im);
    const explicitTopic = topicMatch ? topicMatch[1].trim() : '';

    const combined = `${ticket?.reason || ''}\n${ticket?.description || ''}\n${intake}`.trim();
    const category = detectCategory(combined, explicitTopic);
    const priority = detectPriority(combined);

    const links = extractLinks(intake);
    const ids = extractDiscordIds(intake);

    const keyDetails = [];
    if (explicitTopic) keyDetails.push(`Tipo informado: ${explicitTopic}`);
    if (links.length) keyDetails.push(`Links/evidências: ${links.length}`);
    if (ids.length) keyDetails.push(`IDs encontrados: ${ids.length}`);

    const missingInfo = [];
    if (category === 'bug' && !/passos\/horario:/i.test(intake)) {
        missingInfo.push('Passos para reproduzir e ambiente (PC/mobile, app, etc).');
    }
    if (category === 'report' && !links.length && ids.length === 0) {
        missingInfo.push('Provas (prints/links) e IDs envolvidos.');
    }
    if (!ticket?.description || String(ticket.description).trim().length < 20) {
        missingInfo.push('Descrição mais detalhada do contexto.');
    }

    const nextStepsStaff = [];
    if (category === 'report') {
        nextStepsStaff.push('Confirmar IDs/links e coletar evidências.');
        nextStepsStaff.push('Checar logs/moderação e aplicar ação conforme regras.');
    } else if (category === 'bug') {
        nextStepsStaff.push('Tentar reproduzir e coletar detalhes do ambiente.');
        nextStepsStaff.push('Registrar passo-a-passo e encaminhar para correção.');
    } else if (category === 'partnership') {
        nextStepsStaff.push('Solicitar mídia kit/briefing e objetivo da parceria.');
        nextStepsStaff.push('Direcionar para responsável comercial do servidor.');
    } else if (category === 'billing') {
        nextStepsStaff.push('Validar transação, comprovantes e timestamps.');
        nextStepsStaff.push('Orientar procedimentos de reembolso/cobrança.');
    } else {
        nextStepsStaff.push('Entender objetivo do usuário e orientar caminho.');
        nextStepsStaff.push('Se necessário, encaminhar para área correta.');
    }

    const summaryLines = [
        `Motivo: ${String(ticket?.reason || '').trim() || '—'}`,
        ticket?.description ? `Descrição inicial: ${String(ticket.description).trim()}` : null,
        intake ? `Triagem: ${intake}` : null
    ].filter(Boolean);

    return {
        category,
        priority,
        summary: summaryLines.join('\n').slice(0, 1800),
        keyDetails,
        missingInfo,
        nextStepsStaff,
        suggestedReplyToUser: '✅ Recebido! Se você tiver prints/links/IDs adicionais, envie aqui no ticket para acelerar o atendimento.'
    };
}

module.exports = {
    resolveIntakeConfig,
    buildWelcome,
    buildSummary,
    formatCategoryLabel,
    formatPriorityLabel
};

