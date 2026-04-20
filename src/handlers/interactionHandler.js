const { UserSelectMenuBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const modalHandler = require('./modalHandler');
const selectHandler = require('./selectHandler');
const panelHandler = require('./panelHandler');
const Logger = require('../utils/logger');

module.exports = async (client, interaction) => {
    try {
        // 1. Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try { await command.execute(interaction); } 
            catch (err) { Logger.log(`Erro CMD: ${err}`, 'ERROR'); }
            return;
        }

        // 2. Painéis (/botconfig)
        if (interaction.customId && (interaction.customId.startsWith('botconfig_') || interaction.customId.startsWith('panel_'))) {
            return await panelHandler(client, interaction);
        }

        // 3. Modals (Formulários)
        if (interaction.isModalSubmit()) {
            return await modalHandler(client, interaction);
        }

        // 4. Select Menus (Qualquer lista: Usuários, Canais, etc)
        if (interaction.isAnySelectMenu()) {
            return await selectHandler(client, interaction);
        }

        // 5. Botões
        if (interaction.isButton()) {
            const id = interaction.customId;

            // --- BOTÃO: INICIAR VERIFICAÇÃO ---
            if (id === 'start_verify') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId('select_verify_invite_user')
                    .setPlaceholder('Pesquise quem te convidou...')
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(userSelect);
                
                await interaction.reply({ 
                    content: '🛡️ **Verificação iniciada**\nPara continuar, selecione abaixo **quem te convidou**:', 
                    components: [row], 
                    ephemeral: true 
                });
                return;
            }

            // --- BOTÃO: INSERIR CÓDIGO ---
            if (id === 'btn_enter_code') {
                return modalHandler.openCodeModal(interaction);
            }

            // --- BOTÃO: OP.GG PLAYER ---
            if (id === 'btn_opgg_player') {
                const modal = new ModalBuilder().setCustomId('modal_opgg_player').setTitle('Buscar Invocador');
                const nick = new TextInputBuilder().setCustomId('opgg_nick').setLabel('Nick').setPlaceholder('Ex: Faker').setStyle(TextInputStyle.Short).setRequired(true);
                const tag = new TextInputBuilder().setCustomId('opgg_tag').setLabel('Tag (sem #)').setPlaceholder('Ex: BR1').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(nick), new ActionRowBuilder().addComponents(tag));
                await interaction.showModal(modal);
                return;
            }

            // --- BOTÃO: OP.GG CAMPEÃO ---
            if (id === 'btn_opgg_champion') {
                const modal = new ModalBuilder().setCustomId('modal_opgg_champion').setTitle('Buscar Build de Campeão');
                const champ = new TextInputBuilder().setCustomId('opgg_champ_name').setLabel('Nome do Campeão').setPlaceholder('Ex: Yasuo').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(champ));
                await interaction.showModal(modal);
                return;
            }
        }

    } catch (error) {
        Logger.log(`Erro InteractionHandler: ${error.message}`, 'ERROR');
        console.error(error);
    }
};
