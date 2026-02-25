// Game recommendations command
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { getComprehensiveRecommendations, getPersonalizedRecommendations } from '../utils/recommendations.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('recommendations')
    .setDescription('Get personalized game recommendations based on your download history')
    .addSubcommand(subcommand =>
        subcommand
            .setName('for-me')
            .setDescription('Get personalized recommendations based on your preferences')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('trending')
            .setDescription('See what games are trending this week')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('new-releases')
            .setDescription('Discover new releases that match your interests')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('dashboard')
            .setDescription('Get a comprehensive overview of all recommendation types')
    );

export async function execute(interaction) {
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    
    try {
        switch (subcommand) {
            case 'for-me':
                await handlePersonalizedRecommendations(interaction, userId);
                break;
            case 'trending':
                await handleTrendingGames(interaction);
                break;
            case 'new-releases':
                await handleNewReleases(interaction, userId);
                break;
            case 'dashboard':
                await handleRecommendationsDashboard(interaction, userId);
                break;
        }
    } catch (error) {
        console.error('Error in recommendations command:', error);
        await interaction.editReply({
            content: '❌ Sorry, there was an error getting your recommendations. Please try again later.',
            ephemeral: true
        });
    }
}

async function handlePersonalizedRecommendations(interaction, userId) {
    const recommendations = await getPersonalizedRecommendations(userId, 5);
    
    if (recommendations.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle('🎮 No Recommendations Yet')
            .setDescription('Download a few games first, and I\'ll learn your preferences to suggest games you\'ll love!')
            .setColor(0x3498db)
            .addFields({
                name: '💡 Tip',
                value: 'Use `/gen` to download some games, then come back for personalized recommendations!',
                inline: false
            });
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setTitle('🎯 Personalized Recommendations')
        .setDescription('Based on your download history, here are games you might enjoy:')
        .setColor(0x9b59b6)
        .setFooter({ 
            text: `Found ${recommendations.length} personalized recommendations`,
            iconURL: interaction.user.displayAvatarURL()
        });
    
    recommendations.forEach((game, index) => {
        const genres = game.genres?.slice(0, 3).join(', ') || 'Various';
        embed.addFields({
            name: `${index + 1}. ${game.name || game.gameName}`,
            value: `🎮 **AppID:** ${game.appId}\n🏷️ **Genres:** ${genres}\n⭐ **Match Score:** ${game.score || 'High'}`,
            inline: true
        });
    });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('refresh-recommendations')
                .setLabel('Refresh Recommendations')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('view-dashboard')
                .setLabel('View Dashboard')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}

async function handleTrendingGames(interaction) {
    const { getTrendingGames } = await import('../utils/recommendations.js');
    const trendingGames = await getTrendingGames(5);
    
    const embed = new EmbedBuilder()
        .setTitle('🔥 Trending Games This Week')
        .setDescription('The hottest games everyone\'s downloading right now!')
        .setColor(0xe74c3c);
    
    if (trendingGames.length === 0) {
        embed.addFields({
            name: '📈 No Trending Data',
            value: 'Not enough recent activity to show trending games. Check back later!',
            inline: false
        });
    } else {
        trendingGames.forEach((game, index) => {
            const genres = game.genres?.slice(0, 3).join(', ') || 'Various';
            embed.addFields({
                name: `${index + 1}. ${game.name}`,
                value: `🎮 **AppID:** ${game.appId}\n🏷️ **Genres:** ${genres}\n📊 **Downloads:** ${game.trendScore}`,
                inline: true
            });
        });
    }
    
    embed.setFooter({ 
        text: `Trending data from the last 7 days`,
        iconURL: interaction.client.user.displayAvatarURL()
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleNewReleases(interaction, userId) {
    const { getNewReleases } = await import('../utils/recommendations.js');
    const newReleases = await getNewReleases(userId, 5);
    
    const embed = new EmbedBuilder()
        .setTitle('🆕 Fresh Releases')
        .setDescription('Brand new games that match your interests!')
        .setColor(0x2ecc71);
    
    if (newReleases.length === 0) {
        embed.addFields({
            name: '🎯 No New Matches',
            value: 'No recent releases match your preferences yet. Keep downloading games to improve matching!',
            inline: false
        });
    } else {
        newReleases.forEach((game, index) => {
            const genres = game.genres?.slice(0, 3).join(', ') || 'Various';
            const releaseDate = game.releaseDate ? `<t:${Math.floor(new Date(game.releaseDate).getTime() / 1000)}:d>` : 'Recently';
            embed.addFields({
                name: `${index + 1}. ${game.name}`,
                value: `🎮 **AppID:** ${game.appId}\n🏷️ **Genres:** ${genres}\n📅 **Released:** ${releaseDate}`,
                inline: true
            });
        });
    }
    
    embed.setFooter({ 
        text: `New releases from the last 30 days`,
        iconURL: interaction.user.displayAvatarURL()
    });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleRecommendationsDashboard(interaction, userId) {
    const recommendations = await getComprehensiveRecommendations(userId);
    
    const embed = new EmbedBuilder()
        .setTitle('🎮 Your Gaming Dashboard')
        .setDescription('A complete overview of games recommended just for you!')
        .setColor(0x3498db)
        .setThumbnail(interaction.user.displayAvatarURL());
    
    // Personalized section
    if (recommendations.personalized.length > 0) {
        const personalizedText = recommendations.personalized
            .slice(0, 3)
            .map((game, i) => `${i + 1}. **${game.name || game.gameName}** (${game.appId})`)
            .join('\n');
        embed.addFields({
            name: '🎯 Just For You',
            value: personalizedText,
            inline: false
        });
    }
    
    // Trending section
    if (recommendations.trending.length > 0) {
        const trendingText = recommendations.trending
            .slice(0, 3)
            .map((game, i) => `${i + 1}. **${game.name}** (${game.appId}) - ${game.trendScore} downloads`)
            .join('\n');
        embed.addFields({
            name: '🔥 Trending Now',
            value: trendingText,
            inline: false
        });
    }
    
    // New releases section
    if (recommendations.newReleases.length > 0) {
        const newReleasesText = recommendations.newReleases
            .slice(0, 3)
            .map((game, i) => `${i + 1}. **${game.name}** (${game.appId})`)
            .join('\n');
        embed.addFields({
            name: '🆕 Fresh Picks',
            value: newReleasesText,
            inline: false
        });
    }
    
    if (recommendations.totalCount === 0) {
        embed.addFields({
            name: '🎮 Get Started',
            value: 'Download some games using `/gen` to get personalized recommendations!',
            inline: false
        });
    }
    
    embed.addFields({
        name: '📊 Quick Stats',
        value: `**Total Recommendations:** ${recommendations.totalCount}\n**Categories:** ${[
            recommendations.personalized.length > 0 && 'Personalized',
            recommendations.trending.length > 0 && 'Trending', 
            recommendations.newReleases.length > 0 && 'New Releases'
        ].filter(Boolean).join(', ') || 'None'}`,
        inline: false
    });
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('view-personalized')
                .setLabel('View Personalized')
                .setEmoji('🎯')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('view-trending')
                .setLabel('View Trending')
                .setEmoji('🔥')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('view-new-releases')
                .setLabel('New Releases')
                .setEmoji('🆕')
                .setStyle(ButtonStyle.Success)
        )
    ];
    
    await interaction.editReply({ embeds: [embed], components });
}