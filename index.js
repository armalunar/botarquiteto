require('dotenv').config();

const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const Config = require('./src/utils/configManager');
const Logger = require('./src/utils/logger');
const BotConsole = require('./src/utils/botConsole');
const interactionHandler = require('./src/handlers/interactionHandler');
const buttonHandler = require('./src/handlers/buttonHandler');

Logger.setSink(BotConsole);

let modalHandler = null;

try {
    modalHandler = require('./src/handlers/modalHandler');
} catch (error) {
    Logger.log(`Modal handler nao carregado: ${error.message}`, 'WARN');
}

Config.load();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

client.commands = new Collection();
client.commandsData = [];
BotConsole.attach(client);

function loadCommands() {
    const foldersPath = path.join(__dirname, 'src', 'commands');
    if (!fs.existsSync(foldersPath)) {
        return;
    }

    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        if (!fs.lstatSync(commandsPath).isDirectory()) {
            continue;
        }

        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);

            try {
                const command = require(filePath);
                if (!command?.data || typeof command.execute !== 'function') {
                    continue;
                }

                client.commands.set(command.data.name, command);
                client.commandsData.push(command.data.toJSON());
            } catch (error) {
                Logger.log(`Falha ao carregar comando ${filePath}: ${error.message}`, 'ERROR');
            }
        }
    }
}

function bindLegacyEvents() {
    try {
        client.on('messageCreate', message => {
            BotConsole.recordEvent('messageCreate', message.guild?.name || 'dm');
            return require('./src/events/messageCreate')(client, message);
        });
    } catch (error) {
        Logger.log(`Falha ao carregar messageCreate: ${error.message}`, 'ERROR');
    }

    try {
        client.on('guildMemberAdd', member => {
            BotConsole.recordEvent('guildMemberAdd', member.user?.tag || member.id);
            return require('./src/events/guildMemberAdd')(client, member);
        });
    } catch (error) {
        Logger.log(`Falha ao carregar guildMemberAdd: ${error.message}`, 'ERROR');
    }

    try {
        const voiceEvent = require('./src/events/voiceStateUpdate');
        client.on('voiceStateUpdate', (oldState, newState) => {
            BotConsole.recordEvent('voiceStateUpdate', `${oldState.channelId || 'none'} -> ${newState.channelId || 'none'}`);
            if (typeof voiceEvent.execute === 'function') {
                voiceEvent.execute(oldState, newState);
            }
        });
    } catch (error) {
        Logger.log(`Falha ao carregar voiceStateUpdate: ${error.message}`, 'ERROR');
    }
}

loadCommands();
bindLegacyEvents();

client.once('ready', async () => {
    Logger.log(`Bot online como ${client.user.tag}`, 'SUCCESS');
    BotConsole.recordEvent('ready', client.user.tag);

    try {
        require('./src/services/creepySystem')(client);
    } catch (error) {}

    const token = Config.get('bot.token');
    const clientId = Config.get('bot.clientId');
    const guildId = Config.get('bot.guildId');

    if (token && clientId && guildId) {
        const rest = new REST().setToken(token);

        try {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: client.commandsData }
            );
            Logger.log('Comandos registrados.', 'SUCCESS');
        } catch (error) {
            Logger.log(`Falha ao registrar comandos: ${error.message}`, 'ERROR');
        }
    } else {
        Logger.log('Token, clientId ou guildId ausentes. Registro automatico ignorado.', 'WARN');
    }

    client.user.setPresence({
        activities: [
            {
                name: Config.get('bot.activityText') || 'Gerenciando o servidor',
                type: Config.get('bot.activityType') || 0
            }
        ],
        status: Config.get('bot.status') || 'online'
    });
});

client.on('interactionCreate', async interaction => {
    const interactionLabel = interaction.isChatInputCommand()
        ? `command:${interaction.commandName}`
        : interaction.isButton()
            ? `button:${interaction.customId}`
            : interaction.isModalSubmit()
                ? `modal:${interaction.customId}`
                : interaction.isAnySelectMenu()
                    ? `select:${interaction.customId}`
                    : 'interaction';

    BotConsole.recordEvent('interaction', interactionLabel);

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) {
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            Logger.log(`Erro no comando ${interaction.commandName}: ${error.message}`, 'ERROR');

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Ocorreu um erro interno ao executar este comando.', ephemeral: true });
            }
        }

        return;
    }

    if (interaction.isButton()) {
        try {
            const handled = await buttonHandler(client, interaction);
            if (!handled && !interaction.replied && !interaction.deferred) {
                await interactionHandler(client, interaction);
            }
        } catch (error) {
            Logger.log(`Erro no button handler: ${error.message}`, 'ERROR');
        }

        return;
    }

    if (interaction.isModalSubmit()) {
        try {
            if (modalHandler) {
                await modalHandler(client, interaction);
                return;
            }

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Nenhum handler de modal foi configurado.', ephemeral: true });
            }
        } catch (error) {
            Logger.log(`Erro no modal handler: ${error.message}`, 'ERROR');
        }

        return;
    }

    try {
        await interactionHandler(client, interaction);
    } catch (error) {
        Logger.log(`Erro no interaction handler: ${error.message}`, 'ERROR');
    }
});

process.on('unhandledRejection', reason => {
    Logger.log(`Unhandled rejection: ${reason}`, 'ERROR');
});

process.on('uncaughtException', error => {
    Logger.log(`Uncaught exception: ${error.message}`, 'ERROR');
});

const token = Config.get('bot.token');
if (token) {
    client.login(token);
} else {
    Logger.log('Token do bot nao configurado.', 'ERROR');
}
