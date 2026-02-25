import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getServerType, SERVER_TYPES, getServerSettings } from '../utils/serverManager.js';
import { getServerInfo } from '../config/servers.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('serverdebug')
    .setDescription('Debug server configuration and settings (Owner only)')
    .setDefaultMemberPermissions(0); // Only bot owner can use

export async function execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '';

    // Only bot owner can use this command
    if (interaction.user.id !== BOT_OWNER_ID) {
        return interaction.reply({
            content: '❌ Only the bot owner can use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guildId;
        const serverType = getServerType(guildId);
        const serverInfo = getServerInfo(guildId);
        const settings = await getServerSettings(guildId);

        // Get all servers from database
        const db = await getDb();
        const allServers = await db.collection('settings').find({}).toArray();

        const embed = new EmbedBuilder()
            .setTitle(`${emojis.Info} Server Debug Information`)
            .setColor(0x5865F2)
            .addFields(
                {
                    name: 'Current Server',
                    value: `**Name:** ${interaction.guild.name}\n**ID:** ${guildId}\n**Type:** ${serverType.toUpperCase()}`,
                    inline: false
                },
                {
                    name: 'Server Info',
                    value: `**Name:** ${serverInfo.name}\n**Type:** ${serverInfo.type}\n**ID:** ${serverInfo.id}`,
                    inline: false
                }
            );

        // Add current server settings
        if (settings) {
            const settingsFields = [];
            if (settings.alertsRole) {
                const role = interaction.guild.roles.cache.get(settings.alertsRole);
                settingsFields.push({
                    name: 'Alerts Role',
                    value: settings.alertsRole === 'everyone' ? '@everyone' : (role ? role.toString() : `Unknown Role (${settings.alertsRole})`),
                    inline: true
                });
            }
            if (settings.alertsChannel) {
                const channel = interaction.guild.channels.cache.get(settings.alertsChannel);
                settingsFields.push({
                    name: 'Alerts Channel',
                    value: channel ? `#${channel.name}` : `Unknown Channel (${settings.alertsChannel})`,
                    inline: true
                });
            }
            if (settings.allowedChannelId) {
                const channel = interaction.guild.channels.cache.get(settings.allowedChannelId);
                settingsFields.push({
                    name: 'Bot Commands Channel',
                    value: channel ? `#${channel.name}` : `Unknown Channel (${settings.allowedChannelId})`,
                    inline: true
                });
            }
            if (settingsFields.length > 0) {
                embed.addFields(settingsFields);
            }
        }

        // Add all servers overview
        if (allServers.length > 0) {
            const serverList = allServers.map(server => {
                const serverType = getServerType(server.guildId);
                const alertsRole = server.alertsRole || 'None';
                const alertsChannel = server.alertsChannel || 'None';
                return `**${serverType.toUpperCase()}** - ID: ${server.guildId}\n  Alerts Role: ${alertsRole}\n  Alerts Channel: ${alertsChannel}`;
            }).join('\n\n');

            embed.addFields({
                name: 'All Servers in Database',
                value: serverList,
                inline: false
            });
        }

        // Add configuration info
        embed.addFields({
            name: 'Configuration',
            value: `**Safe Server ID:** ${getServerInfo('1317915330084995163').id}\n**Main Server ID:** ${getServerInfo('1387992514388037803').id}`,
            inline: false
        });

        embed.setTimestamp()
            .setFooter({ text: 'SB Manifest Bot Debug' });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in serverdebug command:', error);
        await interaction.editReply({
            content: '❌ An error occurred while fetching server debug information.',
            ephemeral: true
        });
    }
}
