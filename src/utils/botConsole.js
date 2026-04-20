const readline = require('readline');
const chalk = require('chalk');
const Config = require('./configManager');

let commandHandler = null;
let ticketSystem = null;

function getCommandHandler() {
    if (!commandHandler) {
        commandHandler = require('../handlers/commandHandler');
    }

    return commandHandler;
}

function getTicketSystem() {
    if (!ticketSystem) {
        ticketSystem = require('./ticketSystem');
    }

    return ticketSystem;
}

function truncate(value, maxLength = 120) {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) {
        return `${size} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = size / 1024;
    let unit = 'KB';

    for (let index = 0; index < units.length; index++) {
        unit = units[index];
        if (value < 1024 || index === units.length - 1) {
            break;
        }
        value /= 1024;
    }

    return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours || parts.length) parts.push(`${hours}h`);
    if (minutes || parts.length) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour12: false });
}

function tokenize(input) {
    const tokens = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match = null;

    while ((match = regex.exec(input)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
    }

    return tokens;
}

function parseValue(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
        return '';
    }

    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
    }

    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null') return null;

    const numeric = Number(text);
    if (!Number.isNaN(numeric) && String(numeric) === text) {
        return numeric;
    }

    const looksLikeJson = (text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'));
    if (looksLikeJson) {
        try {
            return JSON.parse(text);
        } catch (error) {}
    }

    return text;
}

function normalizeStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    const allowed = new Set(['online', 'idle', 'dnd', 'invisible']);
    return allowed.has(status) ? status : '';
}

class BotConsole {
    constructor() {
        this.client = null;
        this.rl = null;
        this.active = false;
        this.startedAt = Date.now();
        this.logs = [];
        this.logCounts = new Map();
        this.eventCounts = new Map();
        this.eventHistory = [];
        this.lastLog = null;
        this.lastEvent = null;
        this.refreshQueued = false;
        this.refreshTimer = null;
        this.shutdownRequested = false;
    }

    attach(client) {
        this.client = client || this.client;

        if (this.active) {
            this.refreshPrompt(true);
            return true;
        }

        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            this.printLine(chalk.gray('[bot-console] TTY nao detectado, console interativo desativado.'));
            return false;
        }

        this.active = true;
        this.printBanner();

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: this.buildPrompt()
        });

        this.rl.on('line', async line => {
            try {
                await this.handleLine(line);
            } catch (error) {
                this.printLine(chalk.red(`Erro no console: ${error.message}`));
            } finally {
                if (this.active) {
                    this.refreshPrompt(true);
                }
            }
        });

        this.rl.on('SIGINT', () => {
            this.shutdown('SIGINT').catch(() => {});
        });

        this.refreshPrompt(true);

        this.refreshTimer = setInterval(() => {
            this.refreshPrompt();
        }, 2000);
        this.refreshTimer.unref?.();

        return true;
    }

    isClientReady() {
        return Boolean(this.client?.isReady?.() && this.client.user);
    }

    printLine(message = '') {
        console.log(message);
    }

    printBanner() {
        this.printLine(chalk.cyan('=== Toxic 2.0 Bot Console ==='));
        this.printLine(chalk.gray(`PID: ${process.pid} | Started: ${new Date(this.startedAt).toLocaleString('pt-BR')}`));
        this.printLine(chalk.gray('Type "help" to see commands. Live data appears in the prompt.'));
        this.printLine('');
    }

    buildPrompt() {
        const status = this.getStatusLabel();
        const ping = this.getPingLabel();
        const guilds = this.client?.guilds?.cache?.size ?? 0;
        const tickets = this.getActiveTickets().length;

        return `bot[${status}|${ping}|g:${guilds}|t:${tickets}]> `;
    }

    getStatusLabel() {
        if (!this.isClientReady()) {
            return 'boot';
        }

        const presenceStatus = this.client?.user?.presence?.status;
        const configuredStatus = Config.get('bot.status') || 'online';
        const value = String(presenceStatus || configuredStatus || 'online').toLowerCase();
        return value || 'boot';
    }

    getPingLabel() {
        if (!this.isClientReady()) {
            return '--';
        }

        const ping = Number(this.client.ws?.ping);
        return Number.isFinite(ping) && ping >= 0 ? `${Math.round(ping)}ms` : '--';
    }

    getActiveTickets() {
        try {
            const system = getTicketSystem();
            return Array.from(system.activeTickets.values());
        } catch (error) {
            return [];
        }
    }

    getMemberCount() {
        if (!this.client?.guilds?.cache) {
            return 0;
        }

        return this.client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0);
    }

    getSnapshot() {
        const memory = process.memoryUsage();
        const botName = String(Config.get('bot.name') || this.client?.user?.username || 'Bot');
        const status = this.getStatusLabel();
        const activityText = String(
            this.client?.user?.presence?.activities?.[0]?.name ||
            Config.get('bot.activityText') ||
            'Gerenciando a comunidade'
        ).trim();
        const activityType = Number(Config.get('bot.activityType') || 0);

        return {
            botName,
            botTag: this.client?.user?.tag || 'Booting',
            status,
            activityText,
            activityType,
            ping: this.getPingLabel(),
            uptime: formatDuration(process.uptime() * 1000),
            heapUsed: formatBytes(memory.heapUsed),
            rss: formatBytes(memory.rss),
            guilds: this.client?.guilds?.cache?.size ?? 0,
            channels: this.client?.channels?.cache?.size ?? 0,
            users: this.client?.users?.cache?.size ?? 0,
            members: this.getMemberCount(),
            commands: this.client?.commands?.size ?? 0,
            activeTickets: this.getActiveTickets().length,
            lastLog: this.lastLog,
            lastEvent: this.lastEvent
        };
    }

    recordLog(entry) {
        const payload = {
            timestamp: Number(entry?.timestamp) || Date.now(),
            type: String(entry?.type || 'INFO').toUpperCase(),
            message: String(entry?.message || '')
        };

        this.logs.push(payload);
        if (this.logs.length > 40) {
            this.logs.shift();
        }

        this.lastLog = payload;
        this.logCounts.set(payload.type, (this.logCounts.get(payload.type) || 0) + 1);
        this.requestPromptRefresh();
    }

    recordEvent(category, detail = '') {
        const payload = {
            category: String(category || 'event'),
            detail: String(detail || ''),
            timestamp: Date.now()
        };

        this.eventHistory.push(payload);
        if (this.eventHistory.length > 40) {
            this.eventHistory.shift();
        }

        this.eventCounts.set(payload.category, (this.eventCounts.get(payload.category) || 0) + 1);
        this.lastEvent = payload;
        this.requestPromptRefresh();
    }

    requestPromptRefresh() {
        if (!this.active || !this.rl) {
            return;
        }

        if (this.rl.line && this.rl.line.length > 0) {
            return;
        }

        if (this.refreshQueued) {
            return;
        }

        this.refreshQueued = true;
        setTimeout(() => {
            this.refreshQueued = false;
            if (this.active && this.rl && (!this.rl.line || this.rl.line.length === 0)) {
                this.refreshPrompt();
            }
        }, 50).unref?.();
    }

    refreshPrompt(force = false) {
        if (!this.active || !this.rl) {
            return;
        }

        this.rl.setPrompt(this.buildPrompt());
        if (force || !this.rl.line || this.rl.line.length === 0) {
            this.rl.prompt(true);
        }
    }

    printHelp() {
        this.printLine(chalk.cyan('Available commands:'));
        this.printLine('  help');
        this.printLine('  stats');
        this.printLine('  logs [n]');
        this.printLine('  events [n]');
        this.printLine('  events clear');
        this.printLine('  tickets');
        this.printLine('  status [online|idle|dnd|invisible]');
        this.printLine('  activity <text>');
        this.printLine('  presence <status> [activity text]');
        this.printLine('  config show');
        this.printLine('  config get <path>');
        this.printLine('  config set <path> <value>');
        this.printLine('  reload');
        this.printLine('  clear');
        this.printLine('  exit');
        this.printLine('');
        this.printLine(chalk.gray('Examples:'));
        this.printLine(chalk.gray('  presence online "Gerenciando a comunidade"'));
        this.printLine(chalk.gray('  config set bot.activityText "Fazendo manutencao"'));
        this.printLine(chalk.gray('  logs 10'));
        this.printLine('');
    }

    printStats(limit = 6) {
        const snapshot = this.getSnapshot();

        this.printLine(chalk.cyan('--- Live Stats ---'));
        this.printLine(`Bot: ${snapshot.botName} | User: ${snapshot.botTag}`);
        this.printLine(`Presence: ${snapshot.status} | ${snapshot.activityText} | Type: ${snapshot.activityType}`);
        this.printLine(`Guilds: ${snapshot.guilds} | Channels: ${snapshot.channels} | Members: ${snapshot.members} | Users cache: ${snapshot.users}`);
        this.printLine(`Ping: ${snapshot.ping} | Uptime: ${snapshot.uptime} | Memory: ${snapshot.heapUsed} / ${snapshot.rss}`);
        this.printLine(`Commands: ${snapshot.commands} | Active tickets: ${snapshot.activeTickets}`);
        this.printLine(`Last event: ${snapshot.lastEvent ? `${snapshot.lastEvent.category}${snapshot.lastEvent.detail ? ` :: ${truncate(snapshot.lastEvent.detail, 80)}` : ''} (${formatTimestamp(snapshot.lastEvent.timestamp)})` : 'none'}`);
        this.printLine(`Last log: ${snapshot.lastLog ? `[${snapshot.lastLog.type}] ${truncate(snapshot.lastLog.message, 120)} (${formatTimestamp(snapshot.lastLog.timestamp)})` : 'none'}`);
        this.printLine('');

        const eventEntries = Array.from(this.eventCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);

        this.printLine(chalk.cyan('Event counters:'));
        if (!eventEntries.length) {
            this.printLine('  none');
        } else {
            for (const [name, count] of eventEntries) {
                this.printLine(`  ${name}: ${count}`);
            }
        }

        this.printLine('');
        this.printLine(chalk.cyan('Recent logs:'));
        const recentLogs = this.logs.slice(-limit);
        if (!recentLogs.length) {
            this.printLine('  none');
        } else {
            for (const entry of recentLogs) {
                this.printLine(`  [${formatTimestamp(entry.timestamp)}] [${entry.type}] ${truncate(entry.message, 140)}`);
            }
        }

        this.printLine('');
    }

    printLogs(limit = 10) {
        const amount = Math.max(1, Math.min(Number(limit) || 10, 25));
        const recentLogs = this.logs.slice(-amount);

        this.printLine(chalk.cyan(`--- Last ${amount} Log(s) ---`));
        if (!recentLogs.length) {
            this.printLine('  none');
        } else {
            for (const entry of recentLogs) {
                this.printLine(`  [${formatTimestamp(entry.timestamp)}] [${entry.type}] ${entry.message}`);
            }
        }

        this.printLine('');
    }

    printEvents(limit = 10) {
        const amount = Math.max(1, Math.min(Number(limit) || 10, 25));
        const recentEvents = this.eventHistory.slice(-amount);

        this.printLine(chalk.cyan(`--- Last ${amount} Event(s) ---`));
        if (!recentEvents.length) {
            this.printLine('  none');
        } else {
            for (const entry of recentEvents) {
                const detail = entry.detail ? ` :: ${entry.detail}` : '';
                this.printLine(`  [${formatTimestamp(entry.timestamp)}] ${entry.category}${detail}`);
            }
        }

        this.printLine('');
    }

    printTickets() {
        const tickets = this.getActiveTickets();
        this.printLine(chalk.cyan(`--- Active Tickets (${tickets.length}) ---`));

        if (!tickets.length) {
            this.printLine('  none');
            this.printLine('');
            return;
        }

        tickets.slice(0, 15).forEach((ticket, index) => {
            const ticketId = ticket.ticketId || ticket.channelId || `ticket-${index + 1}`;
            const userLabel = ticket.userTag || ticket.userId || 'unknown';
            const claimedLabel = ticket.claimedBy || 'unassigned';
            const stage = ticket.stage || 'new';
            const priority = ticket.priority || 'normal';
            this.printLine(`  ${index + 1}. ${ticketId} | user: ${userLabel} | stage: ${stage} | priority: ${priority} | claimed: ${claimedLabel}`);
        });

        if (tickets.length > 15) {
            this.printLine(`  ... and ${tickets.length - 15} more.`);
        }

        this.printLine('');
    }

    printConfigSnapshot() {
        this.printLine(chalk.cyan('--- Config Snapshot ---'));
        this.printLine(`bot.status: ${Config.get('bot.status') || 'online'}`);
        this.printLine(`bot.activityText: ${Config.get('bot.activityText') || 'Gerenciando a comunidade'}`);
        this.printLine(`bot.activityType: ${Config.get('bot.activityType') || 0}`);
        this.printLine(`tickets.maxTicketsPerUser: ${Config.get('tickets.maxTicketsPerUser') || 1}`);
        this.printLine(`tickets.counter: ${Config.get('tickets.counter') || 0}`);
        this.printLine(`automod.antiSpam: ${Config.get('automod.antiSpam') ? 'true' : 'false'}`);
        this.printLine(`moderation.antiRaid.enabled: ${Config.get('moderation.antiRaid.enabled') ? 'true' : 'false'}`);
        this.printLine('');
    }

    async applyPresenceFromConfig() {
        if (!this.isClientReady()) {
            return false;
        }

        try {
            const status = normalizeStatus(Config.get('bot.status')) || 'online';
            const activityText = String(Config.get('bot.activityText') || 'Gerenciando a comunidade').trim() || 'Gerenciando a comunidade';
            const activityType = Number(Config.get('bot.activityType') || 0);

            await this.client.user.setPresence({
                activities: [
                    {
                        name: activityText,
                        type: Number.isFinite(activityType) ? activityType : 0
                    }
                ],
                status
            });

            return true;
        } catch (error) {
            this.printLine(chalk.red(`Nao foi possivel atualizar a presence: ${error.message}`));
            return false;
        }
    }

    async commandStatus(tokens) {
        if (!tokens.length) {
            this.printLine(`Current status: ${Config.get('bot.status') || 'online'}`);
            this.printLine('');
            return;
        }

        const status = normalizeStatus(tokens[0]);
        if (!status) {
            this.printLine(chalk.yellow('Status invalido. Use: online, idle, dnd ou invisible.'));
            this.printLine('');
            return;
        }

        Config.set('bot.status', status);
        await this.applyPresenceFromConfig();
        this.printLine(chalk.green(`Status atualizado para ${status}.`));
        this.printLine('');
    }

    async commandActivity(tokens) {
        const text = tokens.join(' ').trim();
        if (!text) {
            this.printLine(`Current activity: ${Config.get('bot.activityText') || 'Gerenciando a comunidade'}`);
            this.printLine('');
            return;
        }

        Config.set('bot.activityText', text);
        await this.applyPresenceFromConfig();
        this.printLine(chalk.green(`Activity atualizada para "${text}".`));
        this.printLine('');
    }

    async commandPresence(tokens) {
        if (!tokens.length) {
            this.printLine(`Current presence: ${Config.get('bot.status') || 'online'} | ${Config.get('bot.activityText') || 'Gerenciando a comunidade'}`);
            this.printLine('');
            return;
        }

        const status = normalizeStatus(tokens[0]);
        if (!status) {
            this.printLine(chalk.yellow('Use: presence <online|idle|dnd|invisible> [activity text]'));
            this.printLine('');
            return;
        }

        const activityText = tokens.slice(1).join(' ').trim();
        Config.set('bot.status', status);
        if (activityText) {
            Config.set('bot.activityText', activityText);
        }

        await this.applyPresenceFromConfig();
        this.printLine(chalk.green(`Presence atualizada para ${status}${activityText ? ` | ${activityText}` : ''}.`));
        this.printLine('');
    }

    async commandConfig(tokens) {
        const sub = String(tokens.shift() || 'show').toLowerCase();

        if (sub === 'show' || sub === 'list') {
            this.printConfigSnapshot();
            return;
        }

        if (sub === 'get') {
            const key = String(tokens.shift() || '').trim();
            if (!key) {
                this.printLine(chalk.yellow('Use: config get <path>'));
                this.printLine('');
                return;
            }

            const value = Config.get(key);
            if (value && typeof value === 'object') {
                this.printLine(`${key}:`);
                this.printLine(JSON.stringify(value, null, 2));
            } else {
                this.printLine(`${key}: ${String(value)}`);
            }
            this.printLine('');
            return;
        }

        if (sub === 'set') {
            const key = String(tokens.shift() || '').trim();
            const valueText = tokens.join(' ').trim();

            if (!key || !valueText) {
                this.printLine(chalk.yellow('Use: config set <path> <value>'));
                this.printLine('');
                return;
            }

            const value = parseValue(valueText);
            try {
                Config.set(key, value);
                if (key === 'bot.status' || key === 'bot.activityText' || key === 'bot.activityType') {
                    await this.applyPresenceFromConfig();
                }
                this.printLine(chalk.green(`Config atualizada: ${key}`));
            } catch (error) {
                this.printLine(chalk.red(`Nao foi possivel atualizar ${key}: ${error.message}`));
            }

            this.printLine('');
            return;
        }

        this.printLine(chalk.yellow('Use: config show | config get <path> | config set <path> <value>'));
        this.printLine('');
    }

    async commandReload() {
        this.printLine(chalk.cyan('Reloading commands...'));
        try {
            await getCommandHandler()(this.client);
            this.printLine(chalk.green('Commands reloaded.'));
        } catch (error) {
            this.printLine(chalk.red(`Reload failed: ${error.message}`));
        }

        this.printLine('');
    }

    clearScreen() {
        if (typeof console.clear === 'function') {
            console.clear();
        }

        this.printBanner();
        this.printConfigSnapshot();
        this.refreshPrompt(true);
    }

    async handleLine(line) {
        const text = String(line || '').trim();
        if (!text) {
            return;
        }

        const tokens = tokenize(text);
        const command = String(tokens.shift() || '').toLowerCase();

        if (!command) {
            return;
        }

        this.recordEvent('command', command);

        if (command === 'help' || command === '?') {
            this.printHelp();
            return;
        }

        if (command === 'stats') {
            this.printStats();
            return;
        }

        if (command === 'logs') {
            const arg = tokens[0];
            if (String(arg || '').toLowerCase() === 'clear') {
                this.logs = [];
                this.logCounts.clear();
                this.printLine(chalk.green('Log buffer cleared.'));
                this.printLine('');
                return;
            }

            this.printLogs(arg);
            return;
        }

        if (command === 'events') {
            const arg = tokens[0];
            if (String(arg || '').toLowerCase() === 'clear') {
                this.eventHistory = [];
                this.eventCounts.clear();
                this.printLine(chalk.green('Event buffer cleared.'));
                this.printLine('');
                return;
            }

            this.printEvents(arg);
            return;
        }

        if (command === 'tickets') {
            this.printTickets();
            return;
        }

        if (command === 'status') {
            await this.commandStatus(tokens);
            return;
        }

        if (command === 'activity') {
            await this.commandActivity(tokens);
            return;
        }

        if (command === 'presence') {
            await this.commandPresence(tokens);
            return;
        }

        if (command === 'config') {
            await this.commandConfig(tokens);
            return;
        }

        if (command === 'reload') {
            await this.commandReload();
            return;
        }

        if (command === 'clear' || command === 'cls') {
            this.clearScreen();
            return;
        }

        if (command === 'exit' || command === 'quit' || command === 'shutdown') {
            await this.shutdown('command');
            return;
        }

        this.printLine(chalk.yellow(`Unknown command: ${command}. Type "help".`));
        this.printLine('');
    }

    async shutdown(reason = 'manual') {
        if (this.shutdownRequested) {
            return;
        }

        this.shutdownRequested = true;
        this.printLine(chalk.yellow(`Shutting down bot console (${reason})...`));

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        try {
            this.rl?.close();
        } catch (error) {}

        try {
            if (this.client?.destroy) {
                await Promise.resolve(this.client.destroy());
            }
        } catch (error) {}

        process.exit(0);
    }

    setClient(client) {
        this.client = client;
    }
}

module.exports = new BotConsole();
