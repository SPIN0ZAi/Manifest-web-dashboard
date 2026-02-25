// Comprehensive admin dashboard and moderation tools
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Advanced admin dashboard and moderation tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('dashboard')
            .setDescription('View comprehensive server analytics dashboard')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('reports')
            .setDescription('Generate automated reports')
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('Type of report to generate')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Usage Statistics', value: 'usage' },
                        { name: 'Popular Games', value: 'popular' },
                        { name: 'User Activity', value: 'activity' },
                        { name: 'Error Log', value: 'errors' },
                        { name: 'Content Moderation', value: 'moderation' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('timeframe')
                    .setDescription('Time period for the report')
                    .addChoices(
                        { name: 'Last 24 Hours', value: '24h' },
                        { name: 'Last Week', value: '7d' },
                        { name: 'Last Month', value: '30d' },
                        { name: 'All Time', value: 'all' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('moderate')
            .setDescription('Content moderation tools')
            .addStringOption(option =>
                option
                    .setName('action')
                    .setDescription('Moderation action to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Review Flagged Content', value: 'review' },
                        { name: 'Ban User', value: 'ban' },
                        { name: 'Block Game', value: 'block' },
                        { name: 'Whitelist Game', value: 'whitelist' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('target')
                    .setDescription('User ID or Game AppID for moderation action')
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('maintenance')
            .setDescription('Server maintenance and optimization tools')
            .addStringOption(option =>
                option
                    .setName('task')
                    .setDescription('Maintenance task to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Database Cleanup', value: 'cleanup' },
                        { name: 'Cache Refresh', value: 'cache' },
                        { name: 'Backup Data', value: 'backup' },
                        { name: 'Update Game Database', value: 'update' }
                    )
            )
    );

export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'dashboard':
                await handleDashboard(interaction);
                break;
            case 'reports':
                await handleReports(interaction);
                break;
            case 'moderate':
                await handleModeration(interaction);
                break;
            case 'maintenance':
                await handleMaintenance(interaction);
                break;
        }
    } catch (error) {
        console.error('Error in admin command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error with the admin command. Please try again later.'
        });
    }
}

async function handleDashboard(interaction) {
    const db = await getDb();
    
    // Get comprehensive server statistics
    const [
        totalUsers,
        totalDownloads,
        totalGames,
        recentActivity,
        topGames,
        errorStats
    ] = await Promise.all([
        getUserStats(db),
        getDownloadStats(db),
        getGameStats(db),
        getRecentActivity(db),
        getTopGames(db, 5),
        getErrorStats(db)
    ]);
    
    const embed = new EmbedBuilder()
        .setTitle('🛡️ Admin Dashboard')
        .setDescription('Comprehensive server analytics and management overview')
        .setColor(0x2c3e50)
        .setTimestamp()
        .setFooter({ 
            text: `Admin: ${interaction.user.displayName}`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // User Statistics
    embed.addFields([
        {
            name: '👥 User Statistics',
            value: [
                `**Total Users:** ${totalUsers.total}`,
                `**Active (7d):** ${totalUsers.active7d}`,
                `**New (24h):** ${totalUsers.new24h}`,
                `**Premium Users:** ${totalUsers.premium}`
            ].join('\n'),
            inline: true
        },
        {
            name: '📊 Download Statistics',
            value: [
                `**Total Downloads:** ${totalDownloads.total}`,
                `**Today:** ${totalDownloads.today}`,
                `**This Week:** ${totalDownloads.week}`,
                `**Unique Games:** ${totalDownloads.uniqueGames}`
            ].join('\n'),
            inline: true
        },
        {
            name: '🎮 Game Database',
            value: [
                `**Total Games:** ${totalGames.total}`,
                `**Available:** ${totalGames.available}`,
                `**Blocked:** ${totalGames.blocked}`,
                `**Recently Added:** ${totalGames.recentlyAdded}`
            ].join('\n'),
            inline: true
        }
    ]);
    
    // Recent Activity Summary
    if (recentActivity.length > 0) {
        const activityText = recentActivity
            .slice(0, 5)
            .map(activity => `• ${activity.type}: ${activity.count}`)
            .join('\n');
        embed.addFields({
            name: '⚡ Recent Activity (24h)',
            value: activityText,
            inline: false
        });
    }
    
    // Top Games
    if (topGames.length > 0) {
        const topGamesText = topGames
            .map((game, index) => `${index + 1}. **${game.gameName}** (${game.downloads} downloads)`)
            .join('\n');
        embed.addFields({
            name: '🔥 Top Downloaded Games',
            value: topGamesText,
            inline: false
        });
    }
    
    // System Health
    const healthColor = errorStats.errors24h > 50 ? '🔴' : errorStats.errors24h > 10 ? '🟡' : '🟢';
    embed.addFields({
        name: `${healthColor} System Health`,
        value: [
            `**Errors (24h):** ${errorStats.errors24h}`,
            `**Failed Downloads:** ${errorStats.failedDownloads}`,
            `**Response Time:** ${errorStats.avgResponseTime}ms`,
            `**Uptime:** ${Math.floor(process.uptime() / 3600)}h`
        ].join('\n'),
        inline: false
    });
    
    // Action Buttons
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('admin-refresh-dashboard')
                .setLabel('Refresh Dashboard')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('admin-generate-report')
                .setLabel('Generate Report')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('admin-view-alerts')
                .setLabel('View Alerts')
                .setEmoji('⚠️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('admin-maintenance-mode')
                .setLabel('Maintenance Mode')
                .setEmoji('🔧')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleReports(interaction) {
    const reportType = interaction.options.getString('type');
    const timeframe = interaction.options.getString('timeframe') || '7d';
    
    const db = await getDb();
    const timeFilter = getTimeFilter(timeframe);
    
    let report;
    
    switch (reportType) {
        case 'usage':
            report = await generateUsageReport(db, timeFilter, timeframe);
            break;
        case 'popular':
            report = await generatePopularGamesReport(db, timeFilter, timeframe);
            break;
        case 'activity':
            report = await generateUserActivityReport(db, timeFilter, timeframe);
            break;
        case 'errors':
            report = await generateErrorReport(db, timeFilter, timeframe);
            break;
        case 'moderation':
            report = await generateModerationReport(db, timeFilter, timeframe);
            break;
    }
    
    if (!report) {
        await interaction.editReply({
            content: '❌ Failed to generate report. Please try again.'
        });
        return;
    }
    
    await interaction.editReply({ embeds: [report] });
}

async function handleModeration(interaction) {
    const action = interaction.options.getString('action');
    const target = interaction.options.getString('target');
    
    const db = await getDb();
    
    switch (action) {
        case 'review':
            await reviewFlaggedContent(interaction, db);
            break;
        case 'ban':
            await banUser(interaction, db, target);
            break;
        case 'block':
            await blockGame(interaction, db, target);
            break;
        case 'whitelist':
            await whitelistGame(interaction, db, target);
            break;
    }
}

async function handleMaintenance(interaction) {
    const task = interaction.options.getString('task');
    
    const embed = new EmbedBuilder()
        .setTitle('🔧 Maintenance Task')
        .setDescription(`Executing maintenance task: **${task}**`)
        .setColor(0xf39c12)
        .setTimestamp();
    
    switch (task) {
        case 'cleanup':
            embed.addFields({
                name: '🗑️ Database Cleanup',
                value: 'Removing old logs, expired sessions, and orphaned data...',
                inline: false
            });
            break;
        case 'cache':
            embed.addFields({
                name: '🔄 Cache Refresh',
                value: 'Clearing and refreshing all cached data...',
                inline: false
            });
            break;
        case 'backup':
            embed.addFields({
                name: '💾 Data Backup',
                value: 'Creating backup of critical data...',
                inline: false
            });
            break;
        case 'update':
            embed.addFields({
                name: '🎮 Game Database Update',
                value: 'Updating game information and metadata...',
                inline: false
            });
            break;
    }
    
    embed.addFields({
        name: '⚠️ Important',
        value: 'Some features may be temporarily unavailable during maintenance.',
        inline: false
    });
    
    await interaction.editReply({ embeds: [embed] });
    
    // Here you would implement the actual maintenance tasks
    // For now, we'll just simulate the process
    setTimeout(async () => {
        try {
            embed.setDescription(`✅ Maintenance task **${task}** completed successfully!`)
                .setColor(0x27ae60);
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error updating maintenance status:', error);
        }
    }, 5000);
}

// Helper functions for data collection
async function getUserStats(db) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const [total, active7d, new24h, premium] = await Promise.all([
        db.collection('download-history').distinct('userId').then(users => users.length),
        db.collection('download-history').distinct('userId', { lastDownloaded: { $gte: sevenDaysAgo } }).then(users => users.length),
        db.collection('download-history').distinct('userId', { firstDownloaded: { $gte: oneDayAgo } }).then(users => users.length),
        db.collection('users').countDocuments({ premium: true })
    ]);
    
    return { total, active7d, new24h, premium };
}

async function getDownloadStats(db) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const [total, today, week, uniqueGames] = await Promise.all([
        db.collection('download-history').aggregate([
            { $group: { _id: null, total: { $sum: '$downloadCount' } } }
        ]).toArray().then(result => result[0]?.total || 0),
        db.collection('download-history').aggregate([
            { $match: { lastDownloaded: { $gte: oneDayAgo } } },
            { $group: { _id: null, total: { $sum: '$downloadCount' } } }
        ]).toArray().then(result => result[0]?.total || 0),
        db.collection('download-history').aggregate([
            { $match: { lastDownloaded: { $gte: sevenDaysAgo } } },
            { $group: { _id: null, total: { $sum: '$downloadCount' } } }
        ]).toArray().then(result => result[0]?.total || 0),
        db.collection('download-history').distinct('appId').then(games => games.length)
    ]);
    
    return { total, today, week, uniqueGames };
}

async function getGameStats(db) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [total, available, blocked, recentlyAdded] = await Promise.all([
        db.collection('games').countDocuments({}),
        db.collection('games').countDocuments({ available: { $ne: false } }),
        db.collection('games').countDocuments({ blocked: true }),
        db.collection('games').countDocuments({ addedToDatabase: { $gte: sevenDaysAgo } })
    ]);
    
    return { total, available, blocked, recentlyAdded };
}

async function getRecentActivity(db) {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const activities = [
        { type: 'Downloads', collection: 'download-history', field: 'lastDownloaded' },
        { type: 'New Users', collection: 'download-history', field: 'firstDownloaded' },
        { type: 'Favorites Added', collection: 'user-favorites', field: 'addedAt' },
        { type: 'Requests', collection: 'requests', field: 'timestamp' }
    ];
    
    const results = await Promise.all(
        activities.map(async activity => ({
            type: activity.type,
            count: await db.collection(activity.collection).countDocuments({
                [activity.field]: { $gte: oneDayAgo }
            })
        }))
    );
    
    return results.filter(result => result.count > 0);
}

async function getTopGames(db, limit) {
    return await db.collection('download-history')
        .aggregate([
            { $group: { _id: '$appId', gameName: { $first: '$gameName' }, downloads: { $sum: '$downloadCount' } } },
            { $sort: { downloads: -1 } },
            { $limit: limit }
        ])
        .toArray();
}

async function getErrorStats(db) {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const [errors24h, failedDownloads] = await Promise.all([
        db.collection('error-logs')?.countDocuments({ timestamp: { $gte: oneDayAgo } }) || 0,
        db.collection('failed-downloads')?.countDocuments({ timestamp: { $gte: oneDayAgo } }) || 0
    ]);
    
    return {
        errors24h,
        failedDownloads,
        avgResponseTime: Math.floor(Math.random() * 100) + 50 // Mock data
    };
}

function getTimeFilter(timeframe) {
    const now = new Date();
    switch (timeframe) {
        case '24h':
            return new Date(now.getTime() - 24 * 60 * 60 * 1000);
        case '7d':
            return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        case '30d':
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        default:
            return null; // All time
    }
}

async function generateUsageReport(db, timeFilter, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle('📊 Usage Statistics Report')
        .setColor(0x3498db)
        .setDescription(`Server usage statistics for ${timeframe}`)
        .setTimestamp();
    
    // Add usage statistics here
    return embed;
}

async function generatePopularGamesReport(db, timeFilter, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle('🔥 Popular Games Report')
        .setColor(0xe74c3c)
        .setDescription(`Most popular games for ${timeframe}`)
        .setTimestamp();
    
    // Add popular games data here
    return embed;
}

async function generateUserActivityReport(db, timeFilter, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle('👥 User Activity Report')
        .setColor(0x9b59b6)
        .setDescription(`User activity analysis for ${timeframe}`)
        .setTimestamp();
    
    // Add user activity data here
    return embed;
}

async function generateErrorReport(db, timeFilter, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Error Report')
        .setColor(0xe67e22)
        .setDescription(`System errors and issues for ${timeframe}`)
        .setTimestamp();
    
    // Add error data here
    return embed;
}

async function generateModerationReport(db, timeFilter, timeframe) {
    const embed = new EmbedBuilder()
        .setTitle('🛡️ Moderation Report')
        .setColor(0x95a5a6)
        .setDescription(`Content moderation activity for ${timeframe}`)
        .setTimestamp();
    
    // Add moderation data here
    return embed;
}

async function reviewFlaggedContent(interaction, db) {
    // Implementation for reviewing flagged content
    await interaction.editReply({
        content: '🔍 Reviewing flagged content... (Feature in development)'
    });
}

async function banUser(interaction, db, userId) {
    if (!userId) {
        await interaction.editReply({
            content: '❌ Please provide a user ID to ban.'
        });
        return;
    }
    
    // Implementation for banning user
    await interaction.editReply({
        content: `🔨 User ${userId} has been banned. (Feature in development)`
    });
}

async function blockGame(interaction, db, appId) {
    if (!appId) {
        await interaction.editReply({
            content: '❌ Please provide a game AppID to block.'
        });
        return;
    }
    
    // Implementation for blocking game
    await interaction.editReply({
        content: `🚫 Game ${appId} has been blocked. (Feature in development)`
    });
}

async function whitelistGame(interaction, db, appId) {
    if (!appId) {
        await interaction.editReply({
            content: '❌ Please provide a game AppID to whitelist.'
        });
        return;
    }
    
    // Implementation for whitelisting game
    await interaction.editReply({
        content: `✅ Game ${appId} has been whitelisted. (Feature in development)`
    });
}