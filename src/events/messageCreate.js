const AutoMod = require('../utils/autoModSystem');

module.exports = async (client, message) => {
    if (!message || message.author?.bot) return;
    if (!message.guild) return;
    await AutoMod.handleMessage(client, message);
};

