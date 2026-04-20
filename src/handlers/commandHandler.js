const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const Config = require('../utils/configManager');
const Logger = require('../utils/logger');

module.exports = async (client) => {
    client.commands.clear();
    const commandsData = [];
    const foldersPath = path.join(__dirname, '../commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            delete require.cache[require.resolve(filePath)]; // Hot Reload support
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commandsData.push(command.data.toJSON());
            } else {
                Logger.log(`Comando em ${filePath} está faltando 'data' ou 'execute'.`, 'WARN');
            }
        }
    }

    client.commandsData = commandsData;

    const rest = new REST().setToken(Config.get('bot.token'));
    try {
        Logger.log(`Registrando ${commandsData.length} comandos...`, 'INFO');
        await rest.put(
            Routes.applicationGuildCommands(Config.get('bot.clientId'), Config.get('bot.guildId')),
            { body: commandsData },
        );
        Logger.log('Comandos de aplicação registrados com sucesso.', 'SUCCESS');
    } catch (error) {
        Logger.log(`Erro ao registrar comandos: ${error}`, 'ERROR');
    }
};
