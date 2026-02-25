import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import crypto from 'crypto';

export const data = new SlashCommandBuilder()
    .setName('apikey')
    .setDescription('Manage API keys for SB Tools desktop application')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('generate')
            .setDescription('Generate a new API key for a user')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user to generate an API key for')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('description')
                    .setDescription('Description for this API key')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('List all API keys'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('revoke')
            .setDescription('Revoke an API key')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('The API key to revoke (first 8 characters)')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('info')
            .setDescription('Get information about an API key')
            .addStringOption(option =>
                option.setName('key')
                    .setDescription('The API key to check (first 8 characters)')
                    .setRequired(true)));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const db = await getDb();

    try {
        switch (subcommand) {
            case 'generate':
                await handleGenerate(interaction, db);
                break;
            case 'list':
                await handleList(interaction, db);
                break;
            case 'revoke':
                await handleRevoke(interaction, db);
                break;
            case 'info':
                await handleInfo(interaction, db);
                break;
        }
    } catch (error) {
        console.error('API key command error:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing the command.',
            ephemeral: true
        });
    }
}

async function handleGenerate(interaction, db) {
    const user = interaction.options.getUser('user');
    const description = interaction.options.getString('description') || 'No description';

    // Generate API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const keyId = crypto.randomBytes(8).toString('hex');

    // Store in database
    await db.collection('api_users').insertOne({
        userId: user.id,
        username: user.username,
        apiKey,
        keyId,
        description,
        createdBy: interaction.user.id,
        createdAt: new Date(),
        active: true,
        lastUsed: null,
        requestCount: 0
    });

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Success} API Key Generated`)
        .setColor(0x00ff00)
        .addFields(
            { name: '👤 User', value: user.toString(), inline: true },
            { name: '🔑 API Key', value: `\`${apiKey}\``, inline: false },
            { name: '🆔 Key ID', value: `\`${keyId}\``, inline: true },
            { name: '📝 Description', value: description, inline: true },
            { name: '📅 Created', value: new Date().toLocaleString(), inline: true }
        )
        .setFooter({ text: 'Keep this API key secure!', iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });

    // Send DM to user with their API key
    try {
        const userEmbed = new EmbedBuilder()
            .setTitle('🔑 Your SB Tools API Key')
            .setColor(0x00ff00)
            .setDescription('You have been granted access to SB Tools desktop application!')
            .addFields(
                { name: '🔑 API Key', value: `\`${apiKey}\``, inline: false },
                { name: '📝 Description', value: description, inline: true },
                { name: '📅 Created', value: new Date().toLocaleString(), inline: true }
            )
            .addFields({
                name: '📋 Instructions',
                value: '1. Download SB Tools from the Discord server\n2. Open Settings (⚙️)\n3. Enter your API key\n4. Start downloading games!',
                inline: false
            })
            .setFooter({ text: 'Keep this API key secure and private!', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await user.send({ embeds: [userEmbed] });
    } catch (dmError) {
        console.error('Failed to send DM to user:', dmError);
        await interaction.followUp({
            content: `⚠️ Generated API key but failed to send DM to ${user.toString()}. They can get their key from an admin.`,
            ephemeral: true
        });
    }
}

async function handleList(interaction, db) {
    const apiKeys = await db.collection('api_users')
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

    if (apiKeys.length === 0) {
        await interaction.reply({
            content: '📋 No API keys found.',
            ephemeral: true
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Success} API Keys (${apiKeys.length})`)
        .setColor(0x00ff00)
        .setTimestamp();

    for (const key of apiKeys.slice(0, 10)) { // Show first 10
        const user = await interaction.client.users.fetch(key.userId).catch(() => null);
        const status = key.active ? '🟢 Active' : '🔴 Inactive';
        const lastUsed = key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : 'Never';
        
        embed.addFields({
            name: `🔑 ${key.keyId} - ${user?.username || 'Unknown User'}`,
            value: `**Status:** ${status}\n**Description:** ${key.description}\n**Requests:** ${key.requestCount}\n**Last Used:** ${lastUsed}\n**Created:** ${new Date(key.createdAt).toLocaleDateString()}`,
            inline: false
        });
    }

    if (apiKeys.length > 10) {
        embed.addFields({
            name: '📋 More Keys',
            value: `...and ${apiKeys.length - 10} more API keys. Use \`/apikey info <key>\` to see details.`,
            inline: false
        });
    }

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

async function handleRevoke(interaction, db) {
    const keyId = interaction.options.getString('key');

    const apiKey = await db.collection('api_users').findOne({ keyId });
    if (!apiKey) {
        await interaction.reply({
            content: '❌ API key not found.',
            ephemeral: true
        });
        return;
    }

    // Deactivate the key
    await db.collection('api_users').updateOne(
        { keyId },
        { $set: { active: false, revokedAt: new Date(), revokedBy: interaction.user.id } }
    );

    const user = await interaction.client.users.fetch(apiKey.userId).catch(() => null);

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Success} API Key Revoked`)
        .setColor(0xff0000)
        .addFields(
            { name: '👤 User', value: user?.toString() || 'Unknown User', inline: true },
            { name: '🆔 Key ID', value: keyId, inline: true },
            { name: '📝 Description', value: apiKey.description, inline: true },
            { name: '📅 Revoked', value: new Date().toLocaleString(), inline: true },
            { name: '📊 Total Requests', value: apiKey.requestCount.toString(), inline: true }
        )
        .setFooter({ text: 'API key has been deactivated', iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
}

async function handleInfo(interaction, db) {
    const keyId = interaction.options.getString('key');

    const apiKey = await db.collection('api_users').findOne({ keyId });
    if (!apiKey) {
        await interaction.reply({
            content: '❌ API key not found.',
            ephemeral: true
        });
        return;
    }

    const user = await interaction.client.users.fetch(apiKey.userId).catch(() => null);
    const createdBy = await interaction.client.users.fetch(apiKey.createdBy).catch(() => null);
    const status = apiKey.active ? '🟢 Active' : '🔴 Inactive';
    const lastUsed = apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleString() : 'Never';

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Success} API Key Information`)
        .setColor(apiKey.active ? 0x00ff00 : 0xff0000)
        .addFields(
            { name: '👤 User', value: user?.toString() || 'Unknown User', inline: true },
            { name: '🆔 Key ID', value: keyId, inline: true },
            { name: '📊 Status', value: status, inline: true },
            { name: '📝 Description', value: apiKey.description, inline: true },
            { name: '📅 Created', value: new Date(apiKey.createdAt).toLocaleString(), inline: true },
            { name: '👨‍💼 Created By', value: createdBy?.toString() || 'Unknown', inline: true },
            { name: '📈 Total Requests', value: apiKey.requestCount.toString(), inline: true },
            { name: '🕒 Last Used', value: lastUsed, inline: true }
        )
        .setFooter({ text: 'API Key Details', iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        ephemeral: true
    });
} 