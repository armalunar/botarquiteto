const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../data/config.json');
const ENV_MAP = {
    'bot.token': 'BOT_TOKEN',
    'bot.clientId': 'BOT_CLIENT_ID',
    'bot.guildId': 'BOT_GUILD_ID'
};

const DEFAULT_CONFIG = {
    bot: {
        name: 'Toxic 2.0',
        status: 'online',
        activityType: 0,
        activityText: 'Gerenciando a comunidade'
    },
    channels: {
        generalLogs: '',
        modLogs: '',
        securityLogs: '',
        welcome: ''
    },
    roles: {
        staff: [],
        verified: '',
        muted: '',
        trusted: '',
        autorole: ''
    },
    tickets: {
        categoryId: '',
        logsChannelId: '',
        supportRoleId: '',
        maxTicketsPerUser: 1,
        counter: 0,
        closeConfirmation: true,
        intake: {
            enabled: true,
            autoWelcome: true,
            includeDisclaimer: true
        }
    },
    automod: {
        antiLink: false,
        antiSpam: true,
        antiFlood: false,
        capsLock: false,
        mentionSpam: false,
        mentionLimit: 5,
        badWords: [],
        duplicateCount: 3,
        duplicateWindowMs: 30 * 1000,
        floodCount: 5,
        floodWindowMs: 7 * 1000,
        capsMinLetters: 10,
        maxCapsPercent: 70,
        warningNoticeCooldownMs: 12 * 1000
    },
    moderation: {
        dmUsers: true,
        warnExpiryDays: 30,
        joinAlertAccountAgeDays: 7,
        raidJoinThreshold: 5,
        raidJoinWindowMs: 60 * 1000,
        antiRaid: {
            enabled: false,
            joinThreshold: 5,
            joinWindowMs: 60 * 1000,
            alertCooldownMs: 3 * 60 * 1000,
            raidModeDurationMs: 10 * 60 * 1000,
            blockUnverifiedMessages: true,
            quarantineRoleId: '',
            dmOnRaidJoin: false
        },
        escalation: [
            { warns: 2, action: 'timeout', duration: '30m' },
            { warns: 4, action: 'timeout', duration: '12h' },
            { warns: 6, action: 'ban' }
        ]
    },
    verification: {
        notifyRoleId: '',
        gameRoles: []
    }
};

function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepMerge(baseValue, overrideValue) {
    if (!isPlainObject(baseValue) || !isPlainObject(overrideValue)) {
        return overrideValue === undefined ? baseValue : overrideValue;
    }

    const merged = { ...baseValue };
    for (const [key, value] of Object.entries(overrideValue)) {
        merged[key] = deepMerge(baseValue[key], value);
    }
    return merged;
}

function ensureConfigDirExists() {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function atomicWriteJson(filePath, data) {
    ensureConfigDirExists();
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath);
}

class ConfigManager {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            ensureConfigDirExists();

            if (!fs.existsSync(configPath)) {
                atomicWriteJson(configPath, DEFAULT_CONFIG);
            }

            const raw = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(raw);
            this.data = deepMerge(DEFAULT_CONFIG, parsed);
            return this.data;
        } catch (error) {
            console.error('Erro ao carregar config:', error);
            this.data = { ...DEFAULT_CONFIG };
            return this.data;
        }
    }

    get(key) {
        const envKey = ENV_MAP[key];
        if (envKey && process.env[envKey]) {
            return process.env[envKey];
        }

        return key.split('.').reduce((current, segment) => current?.[segment], this.data);
    }

    set(key, value) {
        if (ENV_MAP[key]) {
            throw new Error(`A chave "${key}" é gerenciada por variável de ambiente e não pode ser salva em config.json.`);
        }

        const keys = key.split('.');
        let current = this.data;

        for (let index = 0; index < keys.length - 1; index++) {
            if (!current[keys[index]] || typeof current[keys[index]] !== 'object') {
                current[keys[index]] = {};
            }

            current = current[keys[index]];
        }

        current[keys[keys.length - 1]] = value;
        this.save();
    }

    save() {
        atomicWriteJson(configPath, this.data);
        this.data = this.load();
    }
}

module.exports = new ConfigManager();
