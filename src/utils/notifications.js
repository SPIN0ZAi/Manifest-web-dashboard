// Smart notifications and alerts system
import { getDb } from './database.js';
import { EmbedBuilder } from 'discord.js';
import { getClient } from './discordClient.js';

// Store scheduler interval IDs for cleanup
let weeklyHighlightsInterval = null;
let priceDropInterval = null;

/**
 * Price drop alert system
 */
export async function checkPriceDrops() {
    try {
        const db = await getDb();

        // Get all price alerts
        const alerts = await db.collection('price-alerts').find({ active: true }).toArray();

        for (const alert of alerts) {
            // Check current price vs target price
            const currentPrice = await getCurrentGamePrice(alert.appId);

            if (currentPrice && currentPrice <= alert.targetPrice && currentPrice < alert.lastKnownPrice) {
                // Price dropped below target!
                await triggerPriceDropAlert(alert, currentPrice);

                // Update last known price
                await db.collection('price-alerts').updateOne(
                    { _id: alert._id },
                    { $set: { lastKnownPrice: currentPrice, lastChecked: new Date() } }
                );
            }
        }
    } catch (error) {
        console.error('Error checking price drops:', error);
    }
}

/**
 * Create a price drop alert for a user
 */
export async function createPriceAlert(userId, appId, gameName, targetPrice) {
    try {
        const db = await getDb();

        // Check if alert already exists
        const existingAlert = await db.collection('price-alerts')
            .findOne({ userId, appId, active: true });

        if (existingAlert) {
            return { success: false, error: 'Price alert already exists for this game' };
        }

        const currentPrice = await getCurrentGamePrice(appId);

        const alertData = {
            userId,
            appId,
            gameName,
            targetPrice,
            lastKnownPrice: currentPrice || 0,
            createdAt: new Date(),
            lastChecked: new Date(),
            active: true
        };

        await db.collection('price-alerts').insertOne(alertData);
        return { success: true };
    } catch (error) {
        console.error('Error creating price alert:', error);
        return { success: false, error: 'Failed to create price alert' };
    }
}

/**
 * Get user's active price alerts
 */
export async function getUserPriceAlerts(userId) {
    try {
        const db = await getDb();
        return await db.collection('price-alerts')
            .find({ userId, active: true })
            .sort({ createdAt: -1 })
            .toArray();
    } catch (error) {
        console.error('Error getting user price alerts:', error);
        return [];
    }
}

/**
 * Weekly gaming highlights generator
 */
export async function generateWeeklyHighlights(guildId) {
    try {
        const db = await getDb();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Get top downloads this week
        const topDownloads = await db.collection('download-history')
            .aggregate([
                { $match: { lastDownloaded: { $gte: oneWeekAgo } } },
                { $group: { _id: '$appId', gameName: { $first: '$gameName' }, downloads: { $sum: 1 } } },
                { $sort: { downloads: -1 } },
                { $limit: 5 }
            ]).toArray();

        // Get new users this week
        const newUsers = await db.collection('download-history')
            .aggregate([
                { $match: { firstDownloaded: { $gte: oneWeekAgo } } },
                { $group: { _id: '$userId' } },
                { $count: 'count' }
            ]).toArray();

        // Get new games added this week
        const newGames = await db.collection('games')
            .find({ addedToDatabase: { $gte: oneWeekAgo } })
            .sort({ addedToDatabase: -1 })
            .limit(5)
            .toArray();

        const embed = new EmbedBuilder()
            .setTitle('📊 Weekly Gaming Highlights')
            .setColor(0x3498db)
            .setDescription('Here\'s what happened in our gaming community this week!')
            .setTimestamp();

        // Top downloads
        if (topDownloads.length > 0) {
            const downloadsText = topDownloads
                .map((game, index) => `${index + 1}. **${game.gameName}** - ${game.downloads} downloads`)
                .join('\n');
            embed.addFields({
                name: '🔥 Most Popular Downloads',
                value: downloadsText,
                inline: false
            });
        }

        // New users
        if (newUsers.length > 0) {
            embed.addFields({
                name: '👋 Community Growth',
                value: `**${newUsers[0].count}** new gamers joined our community!`,
                inline: true
            });
        }

        // New games
        if (newGames.length > 0) {
            const gamesText = newGames
                .map(game => `• **${game.name}**`)
                .join('\n');
            embed.addFields({
                name: '🆕 New Games Added',
                value: gamesText,
                inline: false
            });
        }

        return embed;
    } catch (error) {
        console.error('Error generating weekly highlights:', error);
        return null;
    }
}

/**
 * Personal dashboard for users
 */
export async function generatePersonalDashboard(userId) {
    try {
        const db = await getDb();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Get user's activity this week
        const weeklyActivity = await db.collection('download-history')
            .find({ userId, lastDownloaded: { $gte: oneWeekAgo } })
            .toArray();

        // Get user's total stats
        const totalStats = await db.collection('download-history')
            .aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: null,
                        totalDownloads: { $sum: '$downloadCount' },
                        uniqueGames: { $sum: 1 }
                    }
                }
            ]).toArray();

        // Get user's favorite genres
        const topGenres = await db.collection('download-history')
            .aggregate([
                { $match: { userId } },
                { $unwind: '$genres' },
                { $group: { _id: '$genres', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 3 }
            ]).toArray();

        // Get pending price alerts
        const activeAlerts = await getUserPriceAlerts(userId);

        const embed = new EmbedBuilder()
            .setTitle('🎮 Your Personal Gaming Dashboard')
            .setColor(0x9b59b6)
            .setDescription('Your gaming activity and personalized insights')
            .setTimestamp();

        // Weekly activity
        embed.addFields({
            name: '📈 This Week',
            value: `**${weeklyActivity.length}** games downloaded\n**${weeklyActivity.reduce((sum, game) => sum + game.downloadCount, 0)}** total downloads`,
            inline: true
        });

        // Total stats
        if (totalStats.length > 0) {
            const stats = totalStats[0];
            embed.addFields({
                name: '🏆 All Time',
                value: `**${stats.totalDownloads}** downloads\n**${stats.uniqueGames}** unique games`,
                inline: true
            });
        }

        // Top genres
        if (topGenres.length > 0) {
            const genresText = topGenres
                .map(genre => `**${genre._id}** (${genre.count})`)
                .join(', ');
            embed.addFields({
                name: '🎯 Favorite Genres',
                value: genresText,
                inline: false
            });
        }

        // Price alerts
        if (activeAlerts.length > 0) {
            embed.addFields({
                name: '💰 Active Price Alerts',
                value: `You have **${activeAlerts.length}** price alerts active`,
                inline: true
            });
        }

        return embed;
    } catch (error) {
        console.error('Error generating personal dashboard:', error);
        return null;
    }
}

/**
 * Send notification to user
 */
export async function sendUserNotification(client, userId, embed, content = null) {
    try {
        const user = await client.users.fetch(userId);
        await user.send({ content, embeds: [embed] });
        return true;
    } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
        return false;
    }
}

/**
 * Trigger price drop alert
 */
async function triggerPriceDropAlert(alert, newPrice) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('💰 Price Drop Alert!')
            .setColor(0x27ae60)
            .setDescription(`Great news! The price for **${alert.gameName}** has dropped!`)
            .addFields([
                {
                    name: '🎯 Target Price',
                    value: `$${alert.targetPrice.toFixed(2)}`,
                    inline: true
                },
                {
                    name: '💵 Current Price',
                    value: `$${newPrice.toFixed(2)}`,
                    inline: true
                },
                {
                    name: '💎 You Save',
                    value: `$${(alert.lastKnownPrice - newPrice).toFixed(2)}`,
                    inline: true
                }
            ])
            .addFields({
                name: '🎮 Game',
                value: `[${alert.gameName}](https://store.steampowered.com/app/${alert.appId})`,
                inline: false
            })
            .setTimestamp();

        // Send notification using shared Discord client
        const discordClient = getClient();
        if (discordClient) {
            await sendUserNotification(discordClient, alert.userId, embed);
        }

        console.log(`Price drop alert triggered for user ${alert.userId}: ${alert.gameName} - $${newPrice}`);
    } catch (error) {
        console.error('Error triggering price drop alert:', error);
    }
}

/**
 * Get current game price from Steam API
 */
async function getCurrentGamePrice(appId) {
    try {
        // This would integrate with Steam Store API
        // For now, return a mock price or implement actual Steam API call
        const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=price_overview`);
        const data = await response.json();

        if (data[appId]?.success && data[appId]?.data?.price_overview) {
            return data[appId].data.price_overview.final / 100; // Convert cents to dollars
        }

        return null;
    } catch (error) {
        console.error('Error fetching current price:', error);
        return null;
    }
}

/**
 * Schedule weekly highlights
 */
export function scheduleWeeklyHighlights(client) {
    // Schedule to run every Sunday at 9 AM
    weeklyHighlightsInterval = setInterval(async () => {
        const now = new Date();
        if (now.getDay() === 0 && now.getHours() === 9) { // Sunday at 9 AM
            try {
                const db = await getDb();
                const guilds = await db.collection('settings').find({}).toArray();

                for (const guildSettings of guilds) {
                    if (guildSettings.weeklyHighlights && guildSettings.highlightsChannel) {
                        const highlights = await generateWeeklyHighlights(guildSettings.guildId);
                        if (highlights) {
                            const channel = await client.channels.fetch(guildSettings.highlightsChannel);
                            if (channel) {
                                await channel.send({ embeds: [highlights] });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error sending weekly highlights:', error);
            }
        }
    }, 60 * 60 * 1000); // Check every hour
}

/**
 * Schedule price drop checks
 */
export function schedulePriceDropChecks() {
    // Check prices every 6 hours
    priceDropInterval = setInterval(async () => {
        await checkPriceDrops();
    }, 6 * 60 * 60 * 1000);
}

/**
 * Stop all notification schedulers (for graceful shutdown)
 */
export function stopNotificationSchedulers() {
    if (weeklyHighlightsInterval) {
        clearInterval(weeklyHighlightsInterval);
        weeklyHighlightsInterval = null;
    }
    if (priceDropInterval) {
        clearInterval(priceDropInterval);
        priceDropInterval = null;
    }
}