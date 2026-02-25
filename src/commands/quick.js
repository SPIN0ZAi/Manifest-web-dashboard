// Quick actions and bulk operations command
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getRecentDownloads, getUserFavorites } from '../utils/downloadTracker.js';
import { getPersonalizedRecommendations } from '../utils/recommendations.js';
import { getAllCollections, getCollectionById, searchCollections } from '../utils/collections.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('quick')
    .setDescription('Quick actions and bulk operations')
    .addSubcommand(subcommand =>
        subcommand
            .setName('recent')
            .setDescription('Quick download your most recent games')
            .addIntegerOption(option =>
                option
                    .setName('count')
                    .setDescription('Number of recent games to show (1-10)')
                    .setMinValue(1)
                    .setMaxValue(10)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('favorites')
            .setDescription('Quick download from your favorites')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('recommended')
            .setDescription('Quick download recommended games')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('bulk-download')
            .setDescription('Download multiple games at once')
            .addStringOption(option =>
                option
                    .setName('appids')
                    .setDescription('Comma-separated AppIDs (e.g., 271590,413150,250900)')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search-filters')
            .setDescription('Advanced game search with filters')
            .addStringOption(option =>
                option
                    .setName('genre')
                    .setDescription('Filter by genre')
                    .addChoices(
                        { name: 'Action', value: 'Action' },
                        { name: 'Adventure', value: 'Adventure' },
                        { name: 'RPG', value: 'RPG' },
                        { name: 'Strategy', value: 'Strategy' },
                        { name: 'Simulation', value: 'Simulation' },
                        { name: 'Sports', value: 'Sports' },
                        { name: 'Racing', value: 'Racing' },
                        { name: 'Puzzle', value: 'Casual' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('price-range')
                    .setDescription('Filter by price range')
                    .addChoices(
                        { name: 'Free', value: 'free' },
                        { name: 'Under $10', value: '0-10' },
                        { name: '$10-$30', value: '10-30' },
                        { name: '$30-$60', value: '30-60' },
                        { name: 'Over $60', value: '60+' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('rating')
                    .setDescription('Minimum rating filter')
                    .addChoices(
                        { name: 'Any Rating', value: 'any' },
                        { name: '70+ (Good)', value: '70' },
                        { name: '80+ (Great)', value: '80' },
                        { name: '90+ (Excellent)', value: '90' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('collections')
            .setDescription('Browse and download from curated game collections')
            .addStringOption(option =>
                option
                    .setName('collection')
                    .setDescription('Choose a collection to browse')
                    .setAutocomplete(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('suggest-collection')
            .setDescription('Suggest a new game collection for the bot')
            .addStringOption(option =>
                option
                    .setName('name')
                    .setDescription('Name of the collection you want to suggest')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('description')
                    .setDescription('Description of what games this collection should include')
                    .setRequired(true)
            )
    );

export async function execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
        switch (subcommand) {
            case 'recent':
                await handleQuickRecent(interaction);
                break;
            case 'favorites':
                await handleQuickFavorites(interaction);
                break;
            case 'recommended':
                await handleQuickRecommended(interaction);
                break;
            case 'bulk-download':
                await handleBulkDownload(interaction);
                break;
            case 'search-filters':
                await handleSearchFilters(interaction);
                break;
            case 'collections':
                await handleCollections(interaction);
                break;
            case 'suggest-collection':
                await handleSuggestCollection(interaction);
                break;
        }
    } catch (error) {
        console.error('Error in quick command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error processing your quick action. Please try again later.'
        });
    }
}

async function handleQuickRecent(interaction) {
    const count = interaction.options.getInteger('count') || 5;
    const recentDownloads = await getRecentDownloads(interaction.user.id, count);
    
    if (recentDownloads.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('📝 No Recent Downloads')
            .setDescription('You haven\'t downloaded any games yet! Use `/gen` to start building your gaming library.')
            .setColor(0x95a5a6);
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('⚡ Quick Recent Downloads')
        .setDescription(`Your ${recentDownloads.length} most recent downloads - click to re-download!`)
        .setColor(0x3498db)
        .setFooter({ 
            text: `Showing ${recentDownloads.length} recent games`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // Create select menu with recent games
    const options = recentDownloads.map((game, index) => ({
        label: game.gameName.substring(0, 100),
        description: `Last downloaded ${new Date(game.lastDownloaded).toLocaleDateString()}`,
        value: `download_${game.appId}`,
        emoji: '🎮'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('quick-recent-download')
        .setPlaceholder('Choose a game to re-download...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    recentDownloads.forEach((game, index) => {
        const lastDownloaded = `<t:${Math.floor(new Date(game.lastDownloaded).getTime() / 1000)}:R>`;
        embed.addFields({
            name: `${index + 1}. ${game.gameName}`,
            value: `📅 ${lastDownloaded} • 📊 Downloaded ${game.downloadCount}x`,
            inline: false
        });
    });
    
    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleQuickFavorites(interaction) {
    const favorites = await getUserFavorites(interaction.user.id, 10);
    
    if (favorites.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('❤️ No Favorites Yet')
            .setDescription('You haven\'t added any games to your favorites! Heart some games to see them here.')
            .setColor(0x95a5a6)
            .addFields({
                name: '💡 How to add favorites',
                value: 'Use `/gen` to download games and click the ❤️ button to add them to favorites!',
                inline: false
            });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('❤️ Quick Favorites')
        .setDescription(`Your ${favorites.length} favorite games - ready for instant download!`)
        .setColor(0xe91e63)
        .setFooter({ 
            text: `${favorites.length} favorite games`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // Create select menu with favorites
    const options = favorites.map(game => ({
        label: game.gameName.substring(0, 100),
        description: `Added ${new Date(game.addedAt).toLocaleDateString()}`,
        value: `download_${game.appId}`,
        emoji: '❤️'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('quick-favorites-download')
        .setPlaceholder('Choose a favorite game to download...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    favorites.forEach((game, index) => {
        const addedDate = `<t:${Math.floor(new Date(game.addedAt).getTime() / 1000)}:d>`;
        const genres = game.genres?.slice(0, 2).join(', ') || 'Various';
        embed.addFields({
            name: `${index + 1}. ${game.gameName}`,
            value: `📅 Added ${addedDate} • 🏷️ ${genres}`,
            inline: false
        });
    });
    
    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleQuickRecommended(interaction) {
    const recommendations = await getPersonalizedRecommendations(interaction.user.id, 8);
    
    if (recommendations.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎯 No Recommendations Yet')
            .setDescription('Download some games first to get personalized recommendations!')
            .setColor(0x95a5a6);
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎯 Quick Recommended Downloads')
        .setDescription('Games picked just for you based on your download history!')
        .setColor(0x9b59b6)
        .setFooter({ 
            text: `${recommendations.length} personalized recommendations`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // Create select menu with recommendations
    const options = recommendations.map(game => ({
        label: (game.name || game.gameName).substring(0, 100),
        description: `Match score: ${game.score || 'High'}`,
        value: `download_${game.appId}`,
        emoji: '🎯'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('quick-recommended-download')
        .setPlaceholder('Choose a recommended game to download...')
        .addOptions(options);
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleBulkDownload(interaction) {
    const appIds = interaction.options.getString('appids');
    const appIdArray = appIds.split(',').map(id => id.trim()).filter(id => id);
    
    if (appIdArray.length === 0) {
        await interaction.editReply({
            content: '❌ Please provide valid AppIDs separated by commas.'
        });
        return;
    }
    
    if (appIdArray.length > 10) {
        await interaction.editReply({
            content: '❌ You can only bulk download up to 10 games at once.'
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('📦 Bulk Download Request')
        .setDescription(`Preparing to download ${appIdArray.length} games...`)
        .setColor(0xf39c12)
        .addFields({
            name: '🎮 Games to Download',
            value: appIdArray.map((id, index) => `${index + 1}. AppID: ${id}`).join('\n'),
            inline: false
        })
        .addFields({
            name: '⚠️ Important Note',
            value: 'Bulk downloads may take longer to process. Each game will be generated individually.',
            inline: false
        });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bulk-confirm_${appIds}`)
                .setLabel('Confirm Bulk Download')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('bulk-cancel')
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleSearchFilters(interaction) {
    const genre = interaction.options.getString('genre');
    const priceRange = interaction.options.getString('price-range');
    const rating = interaction.options.getString('rating');
    
    const db = await getDb();
    
    // Build search query
    const searchQuery = {};
    
    if (genre) {
        searchQuery.genres = { $in: [genre] };
    }
    
    if (priceRange && priceRange !== 'any') {
        if (priceRange === 'free') {
            searchQuery.is_free = true;
        } else {
            const [min, max] = priceRange.split('-').map(p => parseFloat(p.replace('+', '')));
            if (max) {
                searchQuery['price_overview.final'] = { $gte: min * 100, $lte: max * 100 };
            } else {
                searchQuery['price_overview.final'] = { $gte: min * 100 };
            }
        }
    }
    
    if (rating && rating !== 'any') {
        searchQuery['metacritic.score'] = { $gte: parseInt(rating) };
    }
    
    // Add adult content filter
    searchQuery.isAdultContent = { $ne: true };
    
    try {
        const games = await db.collection('games')
            .find(searchQuery)
            .sort({ downloadCount: -1 })
            .limit(15)
            .toArray();
        
        if (games.length === 0) {
            await interaction.editReply({
                content: '❌ No games found matching your filters. Try adjusting your search criteria.'
            });
            return;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 Filtered Game Search Results')
            .setDescription(`Found ${games.length} games matching your criteria`)
            .setColor(0x3498db);
        
        // Add filter info
        const filterInfo = [];
        if (genre) filterInfo.push(`🏷️ Genre: ${genre}`);
        if (priceRange) filterInfo.push(`💰 Price: ${priceRange}`);
        if (rating && rating !== 'any') filterInfo.push(`⭐ Rating: ${rating}+`);
        
        if (filterInfo.length > 0) {
            embed.addFields({
                name: '🔍 Active Filters',
                value: filterInfo.join('\n'),
                inline: false
            });
        }
        
        // Create select menu with results
        const options = games.slice(0, 25).map(game => ({
            label: game.name.substring(0, 100),
            description: `${game.genres?.slice(0, 2).join(', ') || 'Various'} • ${game.downloadCount || 0} downloads`,
            value: `download_${game.appId}`,
            emoji: '🎮'
        }));
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('filtered-search-download')
            .setPlaceholder('Choose a game from search results...')
            .addOptions(options);
        
        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        await interaction.editReply({ embeds: [embed], components: [row] });
        
    } catch (error) {
        console.error('Error in filtered search:', error);
        await interaction.editReply({
            content: '❌ Error performing filtered search. Please try again.'
        });
    }
}

async function handleCollections(interaction) {
    const collectionId = interaction.options.getString('collection');
    
    if (!collectionId) {
        // Show all available collections
        await showAllCollections(interaction);
    } else {
        // Show specific collection
        await showSpecificCollection(interaction, collectionId);
    }
}

async function showAllCollections(interaction) {
    const collections = getAllCollections();
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Curated Game Collections')
        .setDescription(`Browse through ${collections.length} carefully curated collections of amazing games!`)
        .setColor(0x8e44ad)
        .setFooter({ 
            text: 'Use /quick collections [collection-name] to browse a specific collection',
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // Group collections for better display
    const collectionChunks = [];
    for (let i = 0; i < collections.length; i += 8) {
        collectionChunks.push(collections.slice(i, i + 8));
    }
    
    collectionChunks.forEach((chunk, chunkIndex) => {
        const collectionText = chunk
            .map(collection => `${collection.emoji} **${collection.name}** (${collection.games.length} games)\n${collection.description}`)
            .join('\n\n');
        
        embed.addFields({
            name: chunkIndex === 0 ? '📚 Available Collections' : '​', // Zero-width space for continuation
            value: collectionText,
            inline: false
        });
    });
    
    // Create select menu with first 25 collections
    const selectOptions = collections.slice(0, 25).map(collection => ({
        label: collection.name.substring(0, 100),
        description: collection.description.substring(0, 100),
        value: collection.id,
        emoji: collection.emoji
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('browse-collection')
        .setPlaceholder('Choose a collection to browse...')
        .addOptions(selectOptions);
    
    const components = [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('suggest-new-collection')
                .setLabel('Suggest New Collection')
                .setEmoji('💡')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function showSpecificCollection(interaction, collectionId) {
    const collection = getCollectionById(collectionId);
    
    if (!collection) {
        await interaction.editReply({
            content: '❌ Collection not found. Use `/quick collections` to see all available collections.'
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`${collection.emoji} ${collection.name}`)
        .setDescription(collection.description)
        .setColor(0x9b59b6)
        .setFooter({ 
            text: `${collection.games.length} games in this collection`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    // Add games to embed
    const gamesList = collection.games
        .map((game, index) => `${index + 1}. **${game.name}** (\`${game.appId}\`)`)
        .join('\n');
    
    embed.addFields({
        name: '🎮 Games in Collection',
        value: gamesList,
        inline: false
    });
    
    // Create select menu for downloading
    const downloadOptions = collection.games.slice(0, 25).map(game => ({
        label: game.name.substring(0, 100),
        description: `AppID: ${game.appId}`,
        value: `download_${game.appId}`,
        emoji: '⬇️'
    }));
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('collection-download')
        .setPlaceholder('Choose a game to download...')
        .addOptions(downloadOptions);
    
    const components = [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bulk-download-collection_${collectionId}`)
                .setLabel('Download All Games')
                .setEmoji('�')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('back-to-collections')
                .setLabel('Back to Collections')
                .setEmoji('🔙')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleSuggestCollection(interaction) {
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    
    // Save suggestion to database
    try {
        const db = await getDb();
        await db.collection('collection-suggestions').insertOne({
            userId: interaction.user.id,
            username: interaction.user.tag,
            name: name,
            description: description,
            timestamp: new Date(),
            status: 'pending'
        });
        
        const embed = new EmbedBuilder()
            .setTitle('💡 Collection Suggestion Submitted!')
            .setColor(0x27ae60)
            .setDescription('Thank you for your suggestion! Our team will review it.')
            .addFields([
                {
                    name: '📝 Collection Name',
                    value: name,
                    inline: true
                },
                {
                    name: '📖 Description',
                    value: description,
                    inline: false
                }
            ])
            .setFooter({ 
                text: 'Collection suggestions help make the bot better!',
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [embed] });
        
        // Log to admin channel if configured
        const settings = await db.collection('settings').findOne({ 
            guildId: interaction.guildId 
        });
        
        if (settings?.requestChannel) {
            const requestChannel = await interaction.client.channels.fetch(settings.requestChannel);
            if (requestChannel) {
                const adminEmbed = new EmbedBuilder()
                    .setTitle('� New Collection Suggestion')
                    .setColor(0xf39c12)
                    .setDescription('A user has suggested a new game collection.')
                    .addFields([
                        { name: '👤 User', value: interaction.user.toString(), inline: true },
                        { name: '📝 Collection Name', value: name, inline: true },
                        { name: '📖 Description', value: description, inline: false },
                        { name: '⏰ Submitted', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    ])
                    .setTimestamp()
                    .setFooter({ text: `Suggestion ID: ${interaction.id}` });
                
                await requestChannel.send({ embeds: [adminEmbed] });
            }
        }
        
    } catch (error) {
        console.error('Error saving collection suggestion:', error);
        await interaction.editReply({
            content: '❌ There was an error submitting your suggestion. Please try again later.'
        });
    }
}

// Autocomplete function for collections
export async function autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    
    if (!focusedValue || focusedValue.length < 1) {
        // Show popular collections if no input
        const collections = getAllCollections().slice(0, 25);
        const choices = collections.map(collection => ({
            name: `${collection.emoji} ${collection.name}`,
            value: collection.id
        }));
        await interaction.respond(choices);
        return;
    }
    
    try {
        const results = searchCollections(focusedValue);
        
        const choices = results.slice(0, 25).map(collection => ({
            name: `${collection.emoji} ${collection.name}`.substring(0, 100),
            value: collection.id
        }));
        
        await interaction.respond(choices);
    } catch (error) {
        console.error('Error in collections autocomplete:', error);
        await interaction.respond([]);
    }
}