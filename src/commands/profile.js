// User profile and achievement system
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { getUserDownloadStats, getRecentDownloads, getUserFavorites } from '../utils/downloadTracker.js';
import { getPersonalizedRecommendations } from '../utils/recommendations.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your gaming profile and achievements')
    .addSubcommand(subcommand =>
        subcommand
            .setName('me')
            .setDescription('View your own profile')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('user')
            .setDescription('View another user\'s profile')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('The user whose profile to view')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('leaderboard')
            .setDescription('View the server gaming leaderboard')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('achievements')
            .setDescription('View your gaming achievements')
    );

export async function execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'me':
                await handleUserProfile(interaction, interaction.user);
                break;
            case 'user':
                const targetUser = interaction.options.getUser('user');
                await handleUserProfile(interaction, targetUser);
                break;
            case 'leaderboard':
                await handleLeaderboard(interaction);
                break;
            case 'achievements':
                await handleAchievements(interaction, interaction.user);
                break;
        }
    } catch (error) {
        console.error('Error in profile command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error loading the profile. Please try again later.'
        });
    }
}

async function handleUserProfile(interaction, user) {
    const userId = user.id;
    const isOwnProfile = userId === interaction.user.id;
    
    // Get user's gaming statistics
    const [stats, recentDownloads, favorites, achievements] = await Promise.all([
        getUserDownloadStats(userId),
        getRecentDownloads(userId, 5),
        getUserFavorites(userId, 5),
        getUserAchievements(userId)
    ]);
    
    if (!stats || stats.totalDownloads === 0) {
        const embed = new EmbedBuilder()
            .setTitle(`🎮 ${user.displayName}'s Gaming Profile`)
            .setDescription(isOwnProfile 
                ? '🌟 Welcome to your gaming journey! Download some games to start building your profile.'
                : '👀 This user hasn\'t started their gaming journey yet.')
            .setColor(0x3498db)
            .setThumbnail(user.displayAvatarURL())
            .addFields({
                name: '💡 Get Started',
                value: 'Use `/gen` to download games and build an awesome profile!',
                inline: false
            });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    // Calculate user level and activity tier
    const level = calculateUserLevel(stats.totalDownloads);
    const activityTier = getActivityTier(stats.totalDownloads, stats.uniqueGames);
    
    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${user.displayName}'s Gaming Profile`)
        .setColor(getTierColor(activityTier))
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`${getTierEmoji(activityTier)} **${activityTier}** • Level ${level}`);
    
    // Gaming Statistics
    const totalSizeGB = (stats.totalSize / (1024 * 1024 * 1024)).toFixed(1);
    embed.addFields([
        {
            name: '📊 Gaming Statistics',
            value: [
                `🎯 **Total Downloads:** ${stats.totalDownloads}`,
                `🎮 **Unique Games:** ${stats.uniqueGames}`,
                `💾 **Total Size:** ${totalSizeGB} GB`,
                `⭐ **Favorites:** ${stats.favoritesCount}`,
                `📈 **Avg Downloads/Game:** ${stats.avgDownloadsPerGame.toFixed(1)}`
            ].join('\n'),
            inline: true
        }
    ]);
    
    // Recent Activity
    if (recentDownloads.length > 0) {
        const recentText = recentDownloads
            .slice(0, 3)
            .map(game => `• **${game.gameName}** (<t:${Math.floor(new Date(game.lastDownloaded).getTime() / 1000)}:R>)`)
            .join('\n');
        embed.addFields({
            name: '🕐 Recent Downloads',
            value: recentText,
            inline: true
        });
    }
    
    // Top Achievements
    if (achievements.length > 0) {
        const achievementText = achievements
            .slice(0, 3)
            .map(achievement => `${achievement.emoji} **${achievement.name}**`)
            .join('\n');
        embed.addFields({
            name: '🏆 Latest Achievements',
            value: achievementText,
            inline: false
        });
    }
    
    // Favorite Genres
    const topGenres = await getTopGenres(userId);
    if (topGenres.length > 0) {
        const genreText = topGenres
            .slice(0, 5)
            .map((genre, index) => `${index + 1}. **${genre.name}** (${genre.count} games)`)
            .join('\n');
        embed.addFields({
            name: '🎯 Favorite Genres',
            value: genreText,
            inline: false
        });
    }
    
    embed.setFooter({ 
        text: `Gaming since ${new Date().getFullYear()} • Profile Level ${level}`,
        iconURL: user.displayAvatarURL()
    });
    
    // Action buttons
    const components = [];
    if (isOwnProfile) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('view-achievements')
                    .setLabel('View All Achievements')
                    .setEmoji('🏆')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('export-data')
                    .setLabel('Export Data')
                    .setEmoji('📤')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('privacy-settings')
                    .setLabel('Privacy Settings')
                    .setEmoji('🔒')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    }
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleLeaderboard(interaction) {
    const db = await getDb();
    
    // Get top users by different metrics
    const [topDownloaders, topCollectors, topFavorites] = await Promise.all([
        getTopDownloaders(db, 10),
        getTopCollectors(db, 10),
        getTopFavorites(db, 10)
    ]);
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 Server Gaming Leaderboard')
        .setColor(0xf1c40f)
        .setDescription('The most active gamers in this server!')
        .setTimestamp();
    
    // Top Downloaders
    if (topDownloaders.length > 0) {
        const downloadersText = topDownloaders
            .map((user, index) => {
                const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
                return `${medal} <@${user.userId}> - ${user.totalDownloads} downloads`;
            })
            .join('\n');
        embed.addFields({
            name: '⬇️ Most Downloads',
            value: downloadersText,
            inline: false
        });
    }
    
    // Top Collectors
    if (topCollectors.length > 0) {
        const collectorsText = topCollectors
            .slice(0, 5)
            .map((user, index) => {
                const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
                return `${medal} <@${user.userId}> - ${user.uniqueGames} games`;
            })
            .join('\n');
        embed.addFields({
            name: '🎮 Biggest Collectors',
            value: collectorsText,
            inline: true
        });
    }
    
    // Top Favorites Users
    if (topFavorites.length > 0) {
        const favoritesText = topFavorites
            .slice(0, 5)
            .map((user, index) => {
                const medal = ['🥇', '🥈', '🥉'][index] || '🏅';
                return `${medal} <@${user.userId}> - ${user.favoritesCount} favorites`;
            })
            .join('\n');
        embed.addFields({
            name: '❤️ Most Favorites',
            value: favoritesText,
            inline: true
        });
    }
    
    embed.setFooter({ 
        text: `Leaderboard updated ${new Date().toLocaleDateString()}`,
        iconURL: interaction.guild?.iconURL()
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleAchievements(interaction, user) {
    const achievements = await getUserAchievements(user.id);
    const stats = await getUserDownloadStats(user.id);
    
    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${user.displayName}'s Achievements`)
        .setColor(0xf1c40f)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(`Unlocked ${achievements.length} achievements!`);
    
    if (achievements.length === 0) {
        embed.addFields({
            name: '🌟 Get Started',
            value: 'Download more games to unlock your first achievements!',
            inline: false
        });
    } else {
        // Group achievements by category
        const categories = groupAchievementsByCategory(achievements);
        
        Object.entries(categories).forEach(([category, categoryAchievements]) => {
            const achievementText = categoryAchievements
                .map(achievement => `${achievement.emoji} **${achievement.name}** - ${achievement.description}`)
                .join('\n');
            embed.addFields({
                name: `${getCategoryEmoji(category)} ${category}`,
                value: achievementText,
                inline: false
            });
        });
    }
    
    // Show progress towards next achievements
    const nextAchievements = getNextAchievements(stats);
    if (nextAchievements.length > 0) {
        const nextText = nextAchievements
            .map(achievement => `${achievement.emoji} **${achievement.name}** - ${achievement.progress}`)
            .join('\n');
        embed.addFields({
            name: '🎯 Coming Up Next',
            value: nextText,
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

// Helper functions
function calculateUserLevel(totalDownloads) {
    // Level formula: √(downloads/10)
    return Math.floor(Math.sqrt(totalDownloads / 10)) + 1;
}

function getActivityTier(totalDownloads, uniqueGames) {
    if (totalDownloads >= 100 && uniqueGames >= 50) return 'Gaming Legend';
    if (totalDownloads >= 50 && uniqueGames >= 25) return 'Hardcore Gamer';
    if (totalDownloads >= 25 && uniqueGames >= 15) return 'Dedicated Player';
    if (totalDownloads >= 10 && uniqueGames >= 8) return 'Active Gamer';
    if (totalDownloads >= 5) return 'Casual Player';
    return 'Newcomer';
}

function getTierColor(tier) {
    const colors = {
        'Gaming Legend': 0xff6b6b,
        'Hardcore Gamer': 0x4ecdc4,
        'Dedicated Player': 0x45b7d1,
        'Active Gamer': 0x96ceb4,
        'Casual Player': 0xfeca57,
        'Newcomer': 0x95a5a6
    };
    return colors[tier] || 0x3498db;
}

function getTierEmoji(tier) {
    const emojis = {
        'Gaming Legend': '👑',
        'Hardcore Gamer': '🎯',
        'Dedicated Player': '🎮',
        'Active Gamer': '🕹️',
        'Casual Player': '🎲',
        'Newcomer': '🌟'
    };
    return emojis[tier] || '🎮';
}

async function getTopGenres(userId) {
    try {
        const db = await getDb();
        const pipeline = [
            { $match: { userId } },
            { $unwind: '$genres' },
            { $group: { _id: '$genres', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
            { $project: { name: '$_id', count: 1, _id: 0 } }
        ];
        
        return await db.collection('download-history').aggregate(pipeline).toArray();
    } catch (error) {
        console.error('Error getting top genres:', error);
        return [];
    }
}

async function getUserAchievements(userId) {
    const stats = await getUserDownloadStats(userId);
    if (!stats) return [];
    
    const achievements = [];
    
    // Download milestones
    if (stats.totalDownloads >= 1) achievements.push({ name: 'First Download', emoji: '🎉', description: 'Downloaded your first game!', category: 'Milestones' });
    if (stats.totalDownloads >= 10) achievements.push({ name: 'Getting Started', emoji: '🚀', description: 'Downloaded 10 games!', category: 'Milestones' });
    if (stats.totalDownloads >= 25) achievements.push({ name: 'Gaming Enthusiast', emoji: '🎮', description: 'Downloaded 25 games!', category: 'Milestones' });
    if (stats.totalDownloads >= 50) achievements.push({ name: 'Hardcore Gamer', emoji: '💪', description: 'Downloaded 50 games!', category: 'Milestones' });
    if (stats.totalDownloads >= 100) achievements.push({ name: 'Gaming Legend', emoji: '👑', description: 'Downloaded 100 games!', category: 'Milestones' });
    
    // Collection achievements
    if (stats.uniqueGames >= 20) achievements.push({ name: 'Collector', emoji: '📚', description: 'Own 20+ unique games!', category: 'Collection' });
    if (stats.uniqueGames >= 50) achievements.push({ name: 'Master Collector', emoji: '🏆', description: 'Own 50+ unique games!', category: 'Collection' });
    
    // Favorites achievements
    if (stats.favoritesCount >= 5) achievements.push({ name: 'Favorites Fan', emoji: '❤️', description: 'Added 5+ games to favorites!', category: 'Social' });
    if (stats.favoritesCount >= 15) achievements.push({ name: 'Love at First Sight', emoji: '😍', description: 'Added 15+ games to favorites!', category: 'Social' });
    
    return achievements;
}

function getNextAchievements(stats) {
    const next = [];
    
    if (stats.totalDownloads < 10) {
        next.push({ name: 'Getting Started', emoji: '🚀', progress: `${stats.totalDownloads}/10 downloads` });
    } else if (stats.totalDownloads < 25) {
        next.push({ name: 'Gaming Enthusiast', emoji: '🎮', progress: `${stats.totalDownloads}/25 downloads` });
    } else if (stats.totalDownloads < 50) {
        next.push({ name: 'Hardcore Gamer', emoji: '💪', progress: `${stats.totalDownloads}/50 downloads` });
    }
    
    return next.slice(0, 3);
}

function groupAchievementsByCategory(achievements) {
    return achievements.reduce((groups, achievement) => {
        const category = achievement.category || 'General';
        if (!groups[category]) groups[category] = [];
        groups[category].push(achievement);
        return groups;
    }, {});
}

function getCategoryEmoji(category) {
    const emojis = {
        'Milestones': '🎯',
        'Collection': '📚',
        'Social': '👥',
        'General': '🌟'
    };
    return emojis[category] || '🏆';
}

async function getTopDownloaders(db, limit) {
    return await db.collection('download-history').aggregate([
        { $group: { _id: '$userId', totalDownloads: { $sum: '$downloadCount' }, userId: { $first: '$userId' } } },
        { $sort: { totalDownloads: -1 } },
        { $limit: limit }
    ]).toArray();
}

async function getTopCollectors(db, limit) {
    return await db.collection('download-history').aggregate([
        { $group: { _id: '$userId', uniqueGames: { $sum: 1 }, userId: { $first: '$userId' } } },
        { $sort: { uniqueGames: -1 } },
        { $limit: limit }
    ]).toArray();
}

async function getTopFavorites(db, limit) {
    return await db.collection('user-favorites').aggregate([
        { $group: { _id: '$userId', favoritesCount: { $sum: 1 }, userId: { $first: '$userId' } } },
        { $sort: { favoritesCount: -1 } },
        { $limit: limit }
    ]).toArray();
}