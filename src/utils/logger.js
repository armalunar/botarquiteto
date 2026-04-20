const chalk = require('chalk');
const moment = require('moment');
const { EmbedBuilder } = require('discord.js');
const Config = require('./configManager');

class Logger {
    static setSink(sink) {
        this.sink = sink || null;
    }

    static log(message, type = 'INFO') {
        const timestamp = moment().format('DD/MM/YYYY HH:mm:ss');
        const timestampMs = Date.now();
        const normalizedType = String(type || 'INFO').toUpperCase();
        const normalizedMessage = String(message ?? '');
        let color = chalk.white;
        if (normalizedType === 'ERROR') color = chalk.red;
        if (normalizedType === 'WARN') color = chalk.yellow;
        if (normalizedType === 'SUCCESS') color = chalk.green;
        
        console.log(`${chalk.gray(`[${timestamp}]`)} ${color(`[${normalizedType}]`)} ${normalizedMessage}`);

        if (this.sink && typeof this.sink.recordLog === 'function') {
            try {
                this.sink.recordLog({
                    timestamp: timestampMs,
                    type: normalizedType,
                    message: normalizedMessage
                });
            } catch (error) {}
        }
    }

    static async channelLog(client, type, title, description, fields = []) {
        const logChannelId = Config.get(`channels.${type}`);
        if (!logChannelId) return;

        try {
            const channel = client.channels.cache.get(logChannelId);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .addFields(fields)
                .setTimestamp()
                .setColor(type === 'modLogs' ? '#ED4245' : '#5865F2')
                .setFooter({ text: 'Toxic 2.0' });

            await channel.send({ embeds: [embed] });
        } catch (e) {
            this.log(`Erro ao logar no canal: ${e.message}`, 'ERROR');
        }
    }
}

module.exports = Logger;
