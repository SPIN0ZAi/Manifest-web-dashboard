// Notifications and alerts management command
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createPriceAlert, getUserPriceAlerts, generatePersonalDashboard } from '../utils/notifications.js';
import { validateAppId } from '../utils/steam.js';
import { fetchSteamStoreInfo, fuzzyFindGames } from '../utils/gen.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Manage your notifications and alerts')
    .addSubcommand(subcommand =>
        subcommand
            .setName('price-alert')
            .setDescription('Set up a price drop alert for a game')
            .addStringOption(option =>
                option
                    .setName('game')
                    .setDescription('Game name or Steam AppID')
                    .setRequired(true)
                    .setAutocomplete(true)
            )
            .addNumberOption(option =>
                option
                    .setName('target-price')
                    .setDescription('Alert me when the price drops to this amount (in USD)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(200)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('my-alerts')
            .setDescription('View and manage your active price alerts')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('dashboard')
            .setDescription('View your personalized gaming dashboard')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('settings')
            .setDescription('Configure your notification preferences')
    );

export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'price-alert':
                await handlePriceAlert(interaction);
                break;
            case 'my-alerts':
                await handleMyAlerts(interaction);
                break;
            case 'dashboard':
                await handleDashboard(interaction);
                break;
            case 'settings':
                await handleSettings(interaction);
                break;
        }
    } catch (error) {
        console.error('Error in notifications command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error managing your notifications. Please try again later.'
        });
    }
}

async function handlePriceAlert(interaction) {
    const gameInput = interaction.options.getString('game');
    const targetPrice = interaction.options.getNumber('target-price');
    let appId = gameInput;
    
    // Validate if input is an AppID
    const isValidAppId = await validateAppId(appId);
    
    if (!isValidAppId) {
        // If not a valid AppID, search by name
        const results = await fuzzyFindGames(gameInput);
        
        if (results.length === 0) {
            await interaction.editReply({
                content: `❌ No game found matching "${gameInput}". Please check the name or try using the Steam AppID.`
            });
            return;
        }
        
        appId = results[0].appId;
    }
    
    // Get game information
    const gameData = await fetchSteamStoreInfo(appId);
    if (!gameData) {
        await interaction.editReply({
            content: `❌ Could not retrieve information for game with AppID: ${appId}`
        });
        return;
    }
    
    // Check if game is free
    if (gameData.is_free) {
        await interaction.editReply({
            content: `❌ **${gameData.name}** is a free-to-play game. Price alerts are only available for paid games.`
        });
        return;
    }
    
    // Check current price
    let currentPrice = null;
    if (gameData.price_overview) {
        currentPrice = gameData.price_overview.final / 100; // Convert cents to dollars
        
        if (targetPrice >= currentPrice) {
            await interaction.editReply({
                content: `❌ **${gameData.name}** currently costs $${currentPrice.toFixed(2)}, which is already at or below your target price of $${targetPrice.toFixed(2)}!`
            });
            return;
        }
    }
    
    // Create the price alert
    const result = await createPriceAlert(interaction.user.id, appId, gameData.name, targetPrice);
    
    if (!result.success) {
        await interaction.editReply({
            content: `❌ ${result.error}`
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🔔 Price Alert Created!')
        .setColor(0x27ae60)
        .setDescription(`I'll notify you when **${gameData.name}** drops to $${targetPrice.toFixed(2)} or below!`)
        .setThumbnail(gameData.header_image)
        .addFields([
            {
                name: '🎮 Game',
                value: gameData.name,
                inline: true
            },
            {
                name: '🎯 Target Price',
                value: `$${targetPrice.toFixed(2)}`,
                inline: true
            },
            {
                name: '💵 Current Price',
                value: currentPrice ? `$${currentPrice.toFixed(2)}` : 'Unknown',
                inline: true
            }
        ])
        .addFields({
            name: '📬 How it works',
            value: '• I check prices every 6 hours\n• You\'ll get a DM when the price drops\n• You can manage alerts with `/notifications my-alerts`',
            inline: false
        })
        .setFooter({ 
            text: 'Price alerts are checked automatically',
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleMyAlerts(interaction) {
    const alerts = await getUserPriceAlerts(interaction.user.id);
    
    if (alerts.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🔔 Your Price Alerts')
            .setColor(0x3498db)
            .setDescription('You don\'t have any active price alerts yet!')
            .addFields({
                name: '💡 Get Started',
                value: 'Use `/notifications price-alert` to set up your first price alert and never miss a great deal!',
                inline: false
            });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🔔 Your Active Price Alerts')
        .setColor(0x3498db)
        .setDescription(`You have ${alerts.length} active price alert${alerts.length > 1 ? 's' : ''}`)
        .setFooter({ 
            text: `${alerts.length} alert${alerts.length > 1 ? 's' : ''} • Updated every 6 hours`,
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();
    
    alerts.forEach((alert, index) => {
        const createdDate = `<t:${Math.floor(new Date(alert.createdAt).getTime() / 1000)}:d>`;
        embed.addFields({
            name: `${index + 1}. ${alert.gameName}`,
            value: [
                `🎯 **Target:** $${alert.targetPrice.toFixed(2)}`,
                `💵 **Last Known:** $${alert.lastKnownPrice?.toFixed(2) || 'Unknown'}`,
                `📅 **Created:** ${createdDate}`,
                `🎮 **AppID:** ${alert.appId}`
            ].join('\n'),
            inline: true
        });
    });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('refresh-alerts')
                .setLabel('Refresh Alerts')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('manage-alerts')
                .setLabel('Manage Alerts')
                .setEmoji('⚙️')
                .setStyle(ButtonStyle.Primary)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleDashboard(interaction) {
    const dashboard = await generatePersonalDashboard(interaction.user.id);
    
    if (!dashboard) {
        await interaction.editReply({
            content: '❌ Unable to generate your dashboard. Please try again later.'
        });
        return;
    }
    
    dashboard.setAuthor({ 
        name: interaction.user.displayName,
        iconURL: interaction.user.displayAvatarURL()
    });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('refresh-dashboard')
                .setLabel('Refresh Dashboard')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('view-recommendations')
                .setLabel('Get Recommendations')
                .setEmoji('🎯')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('export-data')
                .setLabel('Export Data')
                .setEmoji('📤')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.editReply({ embeds: [dashboard], components });
}

async function handleSettings(interaction) {
    const db = await getDb();
    const userSettings = await db.collection('user-settings').findOne({ userId: interaction.user.id }) || {};
    
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Notification Settings')
        .setColor(0x95a5a6)
        .setDescription('Customize how and when you receive notifications')
        .addFields([
            {
                name: '🔔 Price Alerts',
                value: userSettings.priceAlerts !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: '📊 Weekly Reports',
                value: userSettings.weeklyReports !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: '🎮 Game Recommendations',
                value: userSettings.recommendations !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: '🆕 New Game Notifications',
                value: userSettings.newGameNotifications !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: '🏆 Achievement Notifications',
                value: userSettings.achievementNotifications !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: '👥 Social Notifications',
                value: userSettings.socialNotifications !== false ? '✅ Enabled' : '❌ Disabled',
                inline: true
            }
        ])
        .setFooter({ 
            text: 'Use the buttons below to toggle settings',
            iconURL: interaction.user.displayAvatarURL()
        });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('toggle-price-alerts')
                .setLabel('Price Alerts')
                .setEmoji('🔔')
                .setStyle(userSettings.priceAlerts !== false ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('toggle-weekly-reports')
                .setLabel('Weekly Reports')
                .setEmoji('📊')
                .setStyle(userSettings.weeklyReports !== false ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('toggle-recommendations')
                .setLabel('Recommendations')
                .setEmoji('🎮')
                .setStyle(userSettings.recommendations !== false ? ButtonStyle.Success : ButtonStyle.Danger)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

// Autocomplete function for game search
export async function autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    
    if (!focusedValue || focusedValue.length < 2) {
        await interaction.respond([]);
        return;
    }
    
    try {
        const results = await fuzzyFindGames(focusedValue, 25);
        
        const choices = results.map(game => ({
            name: `${game.name} (${game.appId})`.substring(0, 100),
            value: game.appId
        }));
        
        await interaction.respond(choices);
    } catch (error) {
        console.error('Error in notifications autocomplete:', error);
        await interaction.respond([]);
    }
}