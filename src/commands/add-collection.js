// Admin command for adding new collections
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getDb } from '../utils/database.js';

export const data = new SlashCommandBuilder()
    .setName('add-collection')
    .setDescription('Add a new predefined game collection (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option
            .setName('id')
            .setDescription('Unique ID for the collection (lowercase, use dashes)')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('name')
            .setDescription('Display name of the collection')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('description')
            .setDescription('Description of the collection')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('emoji')
            .setDescription('Emoji for the collection')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('games')
            .setDescription('Comma-separated AppIDs (e.g., 271590,413150,367520)')
            .setRequired(true)
    );

export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Check if user is bot owner
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '';
    if (interaction.user.id !== BOT_OWNER_ID) {
        await interaction.editReply({
            content: '❌ Only the bot owner can add new collections.'
        });
        return;
    }

    const collectionId = interaction.options.getString('id');
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const emoji = interaction.options.getString('emoji');
    const gamesInput = interaction.options.getString('games');

    try {
        // Parse game AppIDs
        const appIds = gamesInput.split(',').map(id => id.trim()).filter(id => id);

        if (appIds.length === 0) {
            await interaction.editReply({
                content: '❌ Please provide at least one valid AppID.'
            });
            return;
        }

        // Validate AppIDs (basic validation)
        const invalidIds = appIds.filter(id => !/^\d+$/.test(id));
        if (invalidIds.length > 0) {
            await interaction.editReply({
                content: `❌ Invalid AppIDs found: ${invalidIds.join(', ')}. AppIDs should be numeric.`
            });
            return;
        }

        // Create games array with placeholder names (you'd fetch real names from Steam API)
        const games = appIds.map(appId => ({
            appId: appId,
            name: `Game ${appId}` // In production, fetch real name from Steam API
        }));

        // Save to database as a new collection template
        const db = await getDb();
        const collectionData = {
            id: collectionId,
            name: name,
            description: description,
            emoji: emoji,
            games: games,
            createdBy: interaction.user.id,
            createdAt: new Date(),
            type: 'predefined'
        };

        // Check if collection ID already exists
        const existing = await db.collection('predefined-collections').findOne({ id: collectionId });
        if (existing) {
            await interaction.editReply({
                content: `❌ A collection with ID "${collectionId}" already exists.`
            });
            return;
        }

        await db.collection('predefined-collections').insertOne(collectionData);

        const embed = new EmbedBuilder()
            .setTitle('📚 Collection Added Successfully!')
            .setColor(0x27ae60)
            .addFields([
                {
                    name: '🆔 Collection ID',
                    value: collectionId,
                    inline: true
                },
                {
                    name: '📝 Name',
                    value: `${emoji} ${name}`,
                    inline: true
                },
                {
                    name: '📖 Description',
                    value: description,
                    inline: false
                },
                {
                    name: '🎮 Games',
                    value: `${games.length} games: ${appIds.join(', ')}`,
                    inline: false
                }
            ])
            .setFooter({
                text: 'Collection added to database - restart bot to apply changes',
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Note: In production, you'd want to either:
        // 1. Hot-reload the collections from database
        // 2. Restart the bot to pick up new collections
        // 3. Use a dynamic system that loads from database instead of the static file

    } catch (error) {
        console.error('Error adding collection:', error);
        await interaction.editReply({
            content: '❌ There was an error adding the collection. Please try again.'
        });
    }
}