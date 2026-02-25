// Enhanced download history and management command
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import { t } from '../utils/localization.js';

export const data = new SlashCommandBuilder()
    .setName('mydownloads')
    .setDescription('View and manage your download history')
    .addSubcommand(subcommand =>
        subcommand
            .setName('history')
            .setDescription('View your recent downloads')
            .addIntegerOption(option =>
                option.setName('page')
                    .setDescription('Page number to view')
                    .setMinValue(1)
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('favorites')
            .setDescription('View your favorite games'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('View your download statistics'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('redownload')
            .setDescription('Re-download a previously downloaded game')
            .addStringOption(option =>
                option.setName('game')
                    .setDescription('Start typing to see your download history')
                    .setAutocomplete(true)
                    .setRequired(true)));

export async function autocomplete(interaction) {
    try {
        const focusedValue = interaction.options.getFocused();
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'redownload') {
            const db = await getDb();
            const userDownloads = await db.collection('download-history')
                .find({ 
                    userId: interaction.user.id,
                    gameName: { $regex: new RegExp(focusedValue, 'i') }
                })
                .sort({ lastDownloaded: -1 })
                .limit(25)
                .toArray();
            
            const choices = userDownloads.map(download => ({
                name: `${download.gameName} (${download.downloadCount} downloads)`,
                value: download.appId
            }));
            
            await interaction.respond(choices);
        }
    } catch (error) {
        console.error('MyDownloads autocomplete error:', error);
        await interaction.respond([]);
    }
}

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const db = await getDb();
    
    await interaction.deferReply({ ephemeral: true });
    
    try {
        switch (subcommand) {
            case 'history':
                await handleHistory(interaction, db);
                break;
            case 'favorites':
                await handleFavorites(interaction, db);
                break;
            case 'stats':
                await handleStats(interaction, db);
                break;
            case 'redownload':
                await handleRedownload(interaction, db);
                break;
        }
    } catch (error) {
        console.error('MyDownloads command error:', error);
        await interaction.editReply({
            content: '❌ An error occurred while processing your request. Please try again.'
        });
    }
}

async function handleHistory(interaction, db) {
    const page = interaction.options.getInteger('page') || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    
    const downloads = await db.collection('download-history')
        .find({ userId: interaction.user.id })
        .sort({ lastDownloaded: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    
    const totalDownloads = await db.collection('download-history')
        .countDocuments({ userId: interaction.user.id });
    
    const totalPages = Math.ceil(totalDownloads / limit);
    
    if (downloads.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📦 Your Download History')
            .setDescription('You haven\'t downloaded any games yet!\nUse `/gen` to download your first game.')
            .setColor(0x5865f2)
            .setFooter({ text: 'Start building your game library today!' });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📦 Your Download History')
        .setDescription(`Page ${page} of ${totalPages} • ${totalDownloads} total downloads`)
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${page}/${totalPages}` });
    
    downloads.forEach((download, index) => {
        const position = skip + index + 1;
        const timeSince = `<t:${Math.floor(download.lastDownloaded.getTime() / 1000)}:R>`;
        
        embed.addFields({
            name: `${position}. ${download.gameName}`,
            value: `🎮 AppID: \`${download.appId}\`\n📊 Downloaded: ${download.downloadCount}x\n⏰ Last: ${timeSince}`,
            inline: true
        });
    });
    
    const components = [];
    if (totalPages > 1) {
        const row = new ActionRowBuilder();
        
        if (page > 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`download-history_${page - 1}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );
        }
        
        if (page < totalPages) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`download-history_${page + 1}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️')
            );
        }
        
        if (row.components.length > 0) {
            components.push(row);
        }
    }
    
    // Add action buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('download-clear-history')
                .setLabel('Clear History')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('download-export-history')
                .setLabel('Export Data')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );
    
    components.push(actionRow);
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleFavorites(interaction, db) {
    const favorites = await db.collection('user-favorites')
        .find({ userId: interaction.user.id })
        .sort({ addedAt: -1 })
        .toArray();
    
    if (favorites.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❤️ Your Favorite Games')
            .setDescription('You haven\'t favorited any games yet!\nUse the ❤️ button when downloading games to add them to favorites.')
            .setColor(0xe91e63)
            .setFooter({ text: 'Favorite games for quick access!' });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('❤️ Your Favorite Games')
        .setDescription(`You have ${favorites.length} favorite games`)
        .setColor(0xe91e63);
    
    favorites.slice(0, 10).forEach((favorite, index) => {
        const timeSince = `<t:${Math.floor(favorite.addedAt.getTime() / 1000)}:R>`;
        
        embed.addFields({
            name: `${index + 1}. ${favorite.gameName}`,
            value: `🎮 AppID: \`${favorite.appId}\`\n⏰ Added: ${timeSince}`,
            inline: true
        });
    });
    
    if (favorites.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${favorites.length} favorites` });
    }
    
    // Add quick action buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('favorites-manage')
                .setLabel('Manage Favorites')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️'),
            new ButtonBuilder()
                .setCustomId('favorites-download-all')
                .setLabel('Download All')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📦')
        );
    
    await interaction.editReply({ embeds: [embed], components: [actionRow] });
}

async function handleStats(interaction, db) {
    const userId = interaction.user.id;
    
    // Get various statistics
    const [
        totalDownloads,
        uniqueGames,
        favoritesCount,
        recentActivity,
        topGenres
    ] = await Promise.all([
        db.collection('download-history').aggregate([
            { $match: { userId } },
            { $group: { _id: null, total: { $sum: '$downloadCount' } } }
        ]).toArray(),
        
        db.collection('download-history').countDocuments({ userId }),
        
        db.collection('user-favorites').countDocuments({ userId }),
        
        db.collection('download-history').find({ userId })
            .sort({ lastDownloaded: -1 })
            .limit(1)
            .toArray(),
        
        db.collection('download-history').aggregate([
            { $match: { userId } },
            { $unwind: '$genres' },
            { $group: { _id: '$genres', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]).toArray()
    ]);
    
    const totalDownloadCount = totalDownloads[0]?.total || 0;
    const lastActivity = recentActivity[0]?.lastDownloaded;
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Your Download Statistics')
        .setColor(0x00d4aa)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields([
            {
                name: '📦 Total Downloads',
                value: `${totalDownloadCount} files`,
                inline: true
            },
            {
                name: '🎮 Unique Games',
                value: `${uniqueGames} games`,
                inline: true
            },
            {
                name: '❤️ Favorites',
                value: `${favoritesCount} games`,
                inline: true
            },
            {
                name: '⏰ Last Activity',
                value: lastActivity ? `<t:${Math.floor(lastActivity.getTime() / 1000)}:R>` : 'Never',
                inline: true
            },
            {
                name: '📈 Member Since',
                value: `<t:${Math.floor(interaction.user.createdTimestamp / 1000)}:D>`,
                inline: true
            },
            {
                name: '🎯 Activity Level',
                value: getActivityLevel(totalDownloadCount),
                inline: true
            }
        ]);
    
    if (topGenres.length > 0) {
        const genreList = topGenres.map((genre, i) => `${i + 1}. ${genre._id} (${genre.count})`).join('\n');
        embed.addFields({
            name: '🏷️ Top Genres',
            value: genreList,
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleRedownload(interaction, db) {
    const appId = interaction.options.getString('game');
    
    // Find the download record
    const downloadRecord = await db.collection('download-history')
        .findOne({ userId: interaction.user.id, appId });
    
    if (!downloadRecord) {
        await interaction.editReply({
            content: '❌ Game not found in your download history.'
        });
        return;
    }
    
    await interaction.editReply({
        content: `🔄 Preparing to re-download **${downloadRecord.gameName}**...\nThis will start a new download process.`,
        components: [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`redownload_${appId}`)
                        .setLabel('Confirm Re-download')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📦'),
                    new ButtonBuilder()
                        .setCustomId('redownload_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❌')
                )
        ]
    });
}

function getActivityLevel(downloadCount) {
    if (downloadCount === 0) return '🌱 New User';
    if (downloadCount < 5) return '🌿 Getting Started';
    if (downloadCount < 15) return '🌳 Regular User';
    if (downloadCount < 50) return '🎮 Gamer';
    if (downloadCount < 100) return '🏆 Power User';
    return '👑 Legend';
}