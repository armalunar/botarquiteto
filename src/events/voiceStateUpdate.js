const { Events } = require('discord.js');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        if (oldState.member.user.bot) return;
    },
};
