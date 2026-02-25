// Comprehensive game information command
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { validateAppId } from '../utils/steam.js';
import { fetchSteamStoreInfo, fetchPeakCCU } from '../utils/gen.js';
import { emojis } from '../utils/emojis.js';
import { getDb } from '../utils/database.js';
import { isFavorite } from '../utils/downloadTracker.js';

export const data = new SlashCommandBuilder()
    .setName('gameinfo')
    .setDescription('Get detailed information about a game')
    .addStringOption(option =>
        option
            .setName('game')
            .setDescription('Game name or Steam AppID')
            .setRequired(true)
            .setAutocomplete(true)
    );

export async function execute(interaction) {
    await interaction.deferReply();
    
    const gameInput = interaction.options.getString('game');
    let appId = gameInput;
    
    try {
        // Validate if input is an AppID
        const isValidAppId = await validateAppId(appId);
        
        if (!isValidAppId) {
            // If not a valid AppID, search by name
            const { fuzzyFindGames } = await import('../utils/gen.js');
            const results = await fuzzyFindGames(gameInput);
            
            if (results.length === 0) {
                await interaction.editReply({
                    content: `❌ No game found matching "${gameInput}". Please check the name or try using the Steam AppID.`
                });
                return;
            }
            
            appId = results[0].appId;
        }
        
        // Fetch comprehensive game data
        const [gameData, peakCCU, downloadStats, userFavorite] = await Promise.all([
            fetchSteamStoreInfo(appId),
            fetchPeakCCU(appId).catch(() => null),
            getGameDownloadStats(appId),
            isFavorite(interaction.user.id, appId)
        ]);
        
        if (!gameData) {
            await interaction.editReply({
                content: `❌ Could not retrieve information for game with AppID: ${appId}`
            });
            return;
        }
        
        // Create comprehensive embed
        const embed = await createGameInfoEmbed(gameData, peakCCU, downloadStats, appId);
        
        // Create action buttons
        const components = await createActionButtons(appId, userFavorite, gameData);
        
        await interaction.editReply({ embeds: [embed], components });
        
    } catch (error) {
        console.error('Error in gameinfo command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error retrieving game information. Please try again later.'
        });
    }
}

async function createGameInfoEmbed(gameData, peakCCU, downloadStats, appId) {
    const embed = new EmbedBuilder()
        .setTitle(`🎮 ${gameData.name}`)
        .setColor(0x1e90ff)
        .setThumbnail(gameData.header_image)
        .setTimestamp();
    
    // Basic Information
    const developers = gameData.developers?.join(', ') || 'Unknown';
    const publishers = gameData.publishers?.join(', ') || 'Unknown';
    const releaseDate = gameData.release_date?.date || 'Unknown';
    
    embed.addFields([
        {
            name: '🏢 Developer & Publisher',
            value: `**Developer:** ${developers}\n**Publisher:** ${publishers}`,
            inline: true
        },
        {
            name: '📅 Release Information',
            value: `**Release Date:** ${releaseDate}\n**AppID:** \`${appId}\``,
            inline: true
        }
    ]);
    
    // Description (truncated)
    if (gameData.short_description) {
        const description = gameData.short_description.length > 200 
            ? gameData.short_description.substring(0, 200) + '...'
            : gameData.short_description;
        embed.addFields({
            name: '📖 Description',
            value: description,
            inline: false
        });
    }
    
    // Genres and Categories
    if (gameData.genres || gameData.categories) {
        const genres = gameData.genres?.map(g => g.description).slice(0, 5).join(', ') || 'None';
        const categories = gameData.categories?.map(c => c.description).slice(0, 3).join(', ') || 'None';
        embed.addFields({
            name: '🏷️ Genres & Categories',
            value: `**Genres:** ${genres}\n**Categories:** ${categories}`,
            inline: false
        });
    }
    
    // System Requirements
    if (gameData.pc_requirements?.minimum) {
        const requirements = extractSystemRequirements(gameData.pc_requirements.minimum);
        if (requirements) {
            embed.addFields({
                name: '💻 System Requirements (Minimum)',
                value: requirements,
                inline: false
            });
        }
    }
    
    // Pricing Information
    if (gameData.price_overview) {
        const price = gameData.price_overview;
        const priceText = price.discount_percent > 0
            ? `~~${price.initial_formatted}~~ **${price.final_formatted}** (${price.discount_percent}% off!)`
            : `**${price.final_formatted}**`;
        embed.addFields({
            name: '💰 Price',
            value: priceText,
            inline: true
        });
    } else if (gameData.is_free) {
        embed.addFields({
            name: '💰 Price',
            value: '**Free to Play** 🆓',
            inline: true
        });
    }
    
    // Player Statistics
    let statsText = '';
    if (peakCCU && peakCCU.peak) {
        statsText += `**Peak Players (24h):** ${peakCCU.peak.toLocaleString()}\n`;
    }
    if (downloadStats) {
        statsText += `**Bot Downloads:** ${downloadStats.totalDownloads}\n`;
        statsText += `**Unique Users:** ${downloadStats.uniqueUsers}`;
    }
    if (statsText) {
        embed.addFields({
            name: '📊 Statistics',
            value: statsText,
            inline: true
        });
    }
    
    // Metacritic Score
    if (gameData.metacritic?.score) {
        embed.addFields({
            name: '⭐ Metacritic Score',
            value: `**${gameData.metacritic.score}/100**`,
            inline: true
        });
    }
    
    // Age Rating
    if (gameData.required_age) {
        embed.addFields({
            name: '🔞 Age Rating',
            value: `**${gameData.required_age}+**`,
            inline: true
        });
    }
    
    // Footer with additional info
    embed.setFooter({ 
        text: `Steam AppID: ${appId} • Last updated: ${new Date().toLocaleDateString()}`,
        iconURL: 'https://cdn.akamai.steamstatic.com/steam/apps/593110/header.jpg'
    });
    
    return embed;
}

async function createActionButtons(appId, userFavorite, gameData) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`download_${appId}`)
            .setLabel('Download Game')
            .setEmoji('⬇️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`favorite_${appId}`)
            .setLabel(userFavorite ? 'Remove Favorite' : 'Add to Favorites')
            .setEmoji(userFavorite ? '💔' : '❤️')
            .setStyle(userFavorite ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setLabel('View on Steam')
            .setEmoji('🛒')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://store.steampowered.com/app/${appId}`),
        new ButtonBuilder()
            .setCustomId(`similar_${appId}`)
            .setLabel('Similar Games')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`reviews_${appId}`)
            .setLabel('User Reviews')
            .setEmoji('📝')
            .setStyle(ButtonStyle.Secondary)
    );
    
    return [row1];
}

function extractSystemRequirements(requirementsHtml) {
    if (!requirementsHtml) return null;
    
    // Extract key information from HTML
    const requirements = [];
    
    // OS
    const osMatch = requirementsHtml.match(/<strong>OS:<\/strong>\s*([^<]+)/i);
    if (osMatch) requirements.push(`**OS:** ${osMatch[1].trim()}`);
    
    // Processor
    const processorMatch = requirementsHtml.match(/<strong>Processor:<\/strong>\s*([^<]+)/i);
    if (processorMatch) requirements.push(`**CPU:** ${processorMatch[1].trim()}`);
    
    // Memory
    const memoryMatch = requirementsHtml.match(/<strong>Memory:<\/strong>\s*([^<]+)/i);
    if (memoryMatch) requirements.push(`**RAM:** ${memoryMatch[1].trim()}`);
    
    // Graphics
    const graphicsMatch = requirementsHtml.match(/<strong>Graphics:<\/strong>\s*([^<]+)/i);
    if (graphicsMatch) requirements.push(`**GPU:** ${graphicsMatch[1].trim()}`);
    
    // Storage
    const storageMatch = requirementsHtml.match(/<strong>Storage:<\/strong>\s*([^<]+)/i);
    if (storageMatch) requirements.push(`**Storage:** ${storageMatch[1].trim()}`);
    
    return requirements.length > 0 ? requirements.slice(0, 5).join('\n') : null;
}

async function getGameDownloadStats(appId) {
    try {
        const db = await getDb();
        
        const stats = await db.collection('download-history').aggregate([
            { $match: { appId: appId } },
            {
                $group: {
                    _id: null,
                    totalDownloads: { $sum: '$downloadCount' },
                    uniqueUsers: { $sum: 1 }
                }
            }
        ]).toArray();
        
        return stats[0] || { totalDownloads: 0, uniqueUsers: 0 };
    } catch (error) {
        console.error('Error getting download stats:', error);
        return null;
    }
}

// Autocomplete function for game search
export async function autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    
    if (!focusedValue || focusedValue.length < 2) {
        await interaction.respond([]);
        return;
    }
    
    try {
        const { fuzzyFindGames } = await import('../utils/gen.js');
        const results = await fuzzyFindGames(focusedValue, 25);
        
        const choices = results.map(game => ({
            name: `${game.name} (${game.appId})`.substring(0, 100),
            value: game.appId
        }));
        
        await interaction.respond(choices);
    } catch (error) {
        console.error('Error in gameinfo autocomplete:', error);
        await interaction.respond([]);
    }
}