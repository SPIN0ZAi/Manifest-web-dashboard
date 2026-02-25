import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getServerType, SERVER_TYPES, getAvailableCommands, getServerSettings, isServerConfigured } from '../utils/serverManager.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Shows information about the current server and available commands');

export async function execute(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const guildId = interaction.guildId;
        const serverType = getServerType(guildId);
        const availableCommands = getAvailableCommands(serverType);
        const settings = await getServerSettings(guildId);
        const isConfigured = await isServerConfigured(guildId);
        
        const embed = new EmbedBuilder()
            .setTitle(`${emojis.Info} Server Information`)
            .setColor(0x5865F2)
            .addFields(
                { 
                    name: 'Server Type', 
                    value: serverType.charAt(0).toUpperCase() + serverType.slice(1), 
                    inline: true 
                },
                { 
                    name: 'Server Name', 
                    value: interaction.guild.name, 
                    inline: true 
                },
                { 
                    name: 'Configuration Status', 
                    value: isConfigured ? '✅ Configured' : '❌ Not Configured', 
                    inline: true 
                }
            );
        
        // Add channel configuration info
        const channelFields = [];
        if (settings.alertsChannel) {
            const alertsChannel = interaction.guild.channels.cache.get(settings.alertsChannel);
            channelFields.push({ 
                name: 'Alerts Channel', 
                value: alertsChannel ? `#${alertsChannel.name}` : 'Unknown Channel', 
                inline: true 
            });
        }
        
        if (settings.allowedChannelId) {
            const allowedChannel = interaction.guild.channels.cache.get(settings.allowedChannelId);
            channelFields.push({ 
                name: 'Bot Commands Channel', 
                value: allowedChannel ? `#${allowedChannel.name}` : 'Unknown Channel', 
                inline: true 
            });
        }
        
        if (settings.logChannel) {
            const logChannel = interaction.guild.channels.cache.get(settings.logChannel);
            channelFields.push({ 
                name: 'Log Channel', 
                value: logChannel ? `#${logChannel.name}` : 'Unknown Channel', 
                inline: true 
            });
        }
        
        if (channelFields.length > 0) {
            embed.addFields(channelFields);
        }
        
        // Add role configuration info
        const roleFields = [];
        if (settings.alertsRole) {
            if (settings.alertsRole === 'everyone') {
                roleFields.push({ name: 'Alerts Role', value: '@everyone', inline: true });
            } else {
                const alertsRole = interaction.guild.roles.cache.get(settings.alertsRole);
                roleFields.push({ 
                    name: 'Alerts Role', 
                    value: alertsRole ? alertsRole.toString() : 'Unknown Role', 
                    inline: true 
                });
            }
        }
        
        if (settings.premiumRoleIds && settings.premiumRoleIds.length > 0) {
            const premiumRoles = settings.premiumRoleIds
                .map(roleId => interaction.guild.roles.cache.get(roleId))
                .filter(role => role)
                .map(role => role.toString());
            
            if (premiumRoles.length > 0) {
                roleFields.push({ 
                    name: 'Premium Roles', 
                    value: premiumRoles.join(', '), 
                    inline: false 
                });
            }
        }
        
        if (roleFields.length > 0) {
            embed.addFields(roleFields);
        }
        
        // Add available commands info
        const commandCategories = {
            'Basic Commands': ['gen', 'genbulk', 'gendlc', 'stats', 'checkgame', 'suggestgame'],
            'Admin Commands': ['gensettings'],
            'Safe Server Only': ['upload', 'uploadzip', 'uploadzipbulk', 'announce', 'apikey', 'autoupdate', 'check-branches', 'clearcache', 'refresh', 'send', 'whitelistgame']
        };
        
        const availableCommandsList = [];
        for (const [category, commands] of Object.entries(commandCategories)) {
            const availableInCategory = commands.filter(cmd => availableCommands.includes(cmd));
            if (availableInCategory.length > 0) {
                availableCommandsList.push(`**${category}:**\n${availableInCategory.map(cmd => `\`/${cmd}\``).join(', ')}`);
            }
        }
        
        if (availableCommandsList.length > 0) {
            embed.addFields({
                name: 'Available Commands',
                value: availableCommandsList.join('\n\n'),
                inline: false
            });
        }
        
        // Add setup instructions if not configured
        if (!isConfigured) {
            embed.addFields({
                name: 'Setup Required',
                value: 'This server needs to be configured. A server admin should use `/gensettings` to:\n' +
                       '1. Set up channels (alerts, bot commands, logs)\n' +
                       '2. Configure roles (premium, admin, moderator)\n' +
                       '3. Set usage limits\n' +
                       '4. Configure the alerts role',
                inline: false
            });
        }
        
        embed.setTimestamp()
            .setFooter({ text: 'SB Manifest Bot' });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error in serverinfo command:', error);
        await interaction.editReply({
            content: '❌ An error occurred while fetching server information.',
            ephemeral: true
        });
    }
}
