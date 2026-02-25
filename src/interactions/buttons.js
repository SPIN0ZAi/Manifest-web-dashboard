import { EmbedBuilder } from 'discord.js';
import { getDb } from '../utils/database.js';
import { t } from '../utils/localization.js';
import { emojis } from '../utils/emojis.js';
import { toggleFavorite } from '../utils/downloadTracker.js';

export async function handleRequestButton(interaction) {
    const customId = interaction.customId;

    // Split the customId into parts and validate
    const parts = customId.split('_');

    if (parts.length < 2) {
        console.error('Invalid customId format:', customId);
        return;
    }

    const [buttonType, ...rest] = parts;
    const appId = rest.join('_'); // Handle cases where appId might contain underscores

    try {
        const db = await getDb();

        let requestType, collectionName, embedTitle, embedDescription, embedColor;

        if (buttonType === 'request-update') {
            requestType = 'update';
            collectionName = 'requests';
            embedTitle = `${emojis.Load} Game Update Request`;
            embedDescription = `A user has requested an update for an existing game in the database.`;
            embedColor = 0x3498DB;
        } else if (buttonType === 'request-game') {
            requestType = 'new';
            collectionName = 'requests';
            embedTitle = `${emojis.Storage} New Game Addition Request`;
            embedDescription = `A user has requested to add a new game to the database.`;
            embedColor = 0xFFA500;
        } else if (buttonType === 'request-dlc') {
            requestType = 'new';
            collectionName = 'dlc-requests';
            embedTitle = `${emojis.Storage} New DLC Addition Request`;
            embedDescription = `A user has requested to add a new DLC to the database.`;
            embedColor = 0x9B59B6;
        } else if (buttonType === 'notify-release') {
            // Handle release notification requests
            await handleReleaseNotificationButton(interaction, appId);
            return;
        } else if (buttonType === 'favorite') {
            // Handle favorite toggle button
            await handleFavoriteButton(interaction, appId);
            return;
        } else if (customId.startsWith('view-') || customId.startsWith('refresh-') || customId.startsWith('bulk-') || customId.startsWith('toggle-')) {
            // Handle various dashboard and utility buttons
            await handleUtilityButton(interaction, customId);
            return;
        } else if (interaction.customId === 'content-help') {
            // Handle content guidelines button
            await handleContentGuidelinesButton(interaction);
            return;
        } else {
            console.error('Unknown button type:', buttonType);
            return;
        }

        const requestData = {
            appId: appId,
            userId: interaction.user.id,
            username: interaction.user.tag,
            guildId: interaction.guildId,
            timestamp: new Date(),
            type: requestType,
            status: 'pending'
        };

        console.info('Saving request:', requestData);
        await db.collection(collectionName).insertOne(requestData);

        const replyContent = await t(
            requestType === 'update' ? 'UPDATE_REQUEST_SUBMITTED' : 'REQUEST_SUBMITTED',
            interaction.guildId
        );
        await interaction.reply({
            content: replyContent,
            ephemeral: true
        });

        const settings = await db.collection('settings').findOne({
            guildId: interaction.guildId
        });

        if (settings?.requestChannel) {
            const requestChannel = await interaction.client.channels.fetch(settings.requestChannel);
            if (requestChannel) {
                const embed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setColor(embedColor)
                    .setDescription(embedDescription)
                    .addFields(
                        { name: `${emojis.AppID} ${buttonType === 'request-dlc' ? 'DLC' : 'Game'} AppID`, value: `\`${appId}\``, inline: true },
                        { name: `${emojis.Requester} ${buttonType === 'request-dlc' ? 'DLC' : 'Game'} Requested by`, value: interaction.user.toString(), inline: true },
                        { name: `${emojis.Time} Request Time`, value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Request ID: ${interaction.id}` });

                await requestChannel.send({ embeds: [embed] });
            }
        }
    } catch (error) {
        console.error('Error processing request:', error);
        await interaction.reply({
            content: await t('REQUEST_ERROR', interaction.guildId),
            ephemeral: true
        });
    }
}

async function handleContentGuidelinesButton(interaction) {
    const guidelinesEmbed = new EmbedBuilder()
        .setTitle('📋 Content Guidelines')
        .setColor(0x3498db)
        .setDescription('Here\'s what content we support and why:')
        .addFields([
            {
                name: '✅ Supported Content',
                value: '• **AAA Games** - Popular mainstream titles\n• **Indie Games** - Creative independent games\n• **Classic Games** - Retro and nostalgic titles\n• **Educational** - Learning and simulation games\n• **Family-Friendly** - All-ages appropriate content',
                inline: false
            },
            {
                name: '❌ Not Supported',
                value: '• Adult/Explicit content\n• NSFW material\n• Hentai or erotic games\n• Content rated Adults Only (AO)',
                inline: false
            },
            {
                name: '🎯 Our Mission',
                value: 'We aim to provide a safe, family-friendly gaming service that everyone can enjoy!',
                inline: false
            },
            {
                name: '💡 Questions?',
                value: 'Contact our support team if you have questions about specific content.',
                inline: false
            }
        ])
        .setFooter({
            text: 'Thanks for being part of our gaming community!',
            iconURL: interaction.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({
        embeds: [guidelinesEmbed],
        ephemeral: true
    });
}

async function handleReleaseNotificationButton(interaction, appId) {
    try {
        const db = await getDb();

        // Check if user is already subscribed to notifications for this game
        const existingNotification = await db.collection('release-notifications').findOne({
            appId: appId,
            userId: interaction.user.id
        });

        if (existingNotification) {
            await interaction.reply({
                content: '🔔 You\'re already subscribed to notifications for this game! I\'ll ping you when it\'s released.',
                ephemeral: true
            });
            return;
        }

        // Add user to notification list
        const notificationData = {
            appId: appId,
            userId: interaction.user.id,
            username: interaction.user.tag,
            guildId: interaction.guildId,
            timestamp: new Date(),
            status: 'active'
        };

        await db.collection('release-notifications').insertOne(notificationData);

        await interaction.reply({
            content: '🔔 **Perfect!** You\'re now subscribed to release notifications for this game!\n\n✨ I\'ll send you a DM as soon as the game is added to our database.\n💫 You can also check back here occasionally for updates!',
            ephemeral: true
        });

        // Log to admin channel if configured
        const settings = await db.collection('settings').findOne({
            guildId: interaction.guildId
        });

        if (settings?.requestChannel) {
            const requestChannel = await interaction.client.channels.fetch(settings.requestChannel);
            if (requestChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('🔔 Release Notification Subscription')
                    .setColor(0x9b59b6)
                    .setDescription('A user has subscribed to release notifications for an unreleased game.')
                    .addFields(
                        { name: '🎮 Game AppID', value: `\`${appId}\``, inline: true },
                        { name: '👤 User', value: interaction.user.toString(), inline: true },
                        { name: '⏰ Subscribed', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Notification ID: ${interaction.id}` });

                await requestChannel.send({ embeds: [embed] });
            }
        }

    } catch (error) {
        console.error('Error handling release notification:', error);
        await interaction.reply({
            content: '❌ Sorry, there was an error setting up your notification. Please try again later.',
            ephemeral: true
        });
    }
}

async function handleFavoriteButton(interaction, appId) {
    try {
        const result = await toggleFavorite(interaction.user.id, appId, 'Unknown Game', {});

        if (result.success) {
            const emoji = result.action === 'added' ? '❤️' : '💔';
            const message = result.action === 'added'
                ? `${emoji} **Added to favorites!** You can view all your favorite games with \`/mydownloads favorites\``
                : `${emoji} **Removed from favorites!** The game is no longer in your favorites list.`;

            await interaction.reply({
                content: message,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❌ Sorry, there was an error updating your favorites. Please try again.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error handling favorite button:', error);
        await interaction.reply({
            content: '❌ Sorry, there was an error updating your favorites. Please try again.',
            ephemeral: true
        });
    }
}

async function handleUtilityButton(interaction, customId) {
    try {
        // Handle various utility buttons
        if (customId === 'view-dashboard' || customId === 'refresh-dashboard') {
            await interaction.reply({
                content: '🔄 Use `/recommendations dashboard` to view your updated gaming dashboard!',
                ephemeral: true
            });
        } else if (customId === 'refresh-recommendations') {
            await interaction.reply({
                content: '🔄 Use `/recommendations for-me` to get fresh personalized recommendations!',
                ephemeral: true
            });
        } else if (customId === 'view-personalized') {
            await interaction.reply({
                content: '🎯 Use `/recommendations for-me` to view your personalized games!',
                ephemeral: true
            });
        } else if (customId === 'view-trending') {
            await interaction.reply({
                content: '🔥 Use `/recommendations trending` to see what\'s hot right now!',
                ephemeral: true
            });
        } else if (customId === 'view-new-releases') {
            await interaction.reply({
                content: '🆕 Use `/recommendations new-releases` to discover fresh games!',
                ephemeral: true
            });
        } else if (customId.startsWith('toggle-')) {
            await interaction.reply({
                content: '⚙️ Use `/notifications settings` to manage your notification preferences!',
                ephemeral: true
            });
        } else if (customId.startsWith('bulk-')) {
            await interaction.reply({
                content: '📦 Bulk operation acknowledged. Please use the appropriate commands for bulk actions.',
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: '❓ Unknown action. Please use the appropriate slash commands.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error handling utility button:', error);
        await interaction.reply({
            content: '❌ There was an error processing your request.',
            ephemeral: true
        });
    }
}

export function isRequestButton(customId) {
    // Use strict prefix matching to avoid false positives
    const knownPrefixes = [
        'request-update_',
        'request-game_',
        'request-dlc_',
        'notify-release_',
        'favorite_',
        'download_',
        'bulk-',
        'toggle-',
        'view-dashboard',
        'refresh-dashboard',
        'refresh-recommendations',
        'view-personalized',
        'view-trending',
        'view-new-releases',
    ];

    return knownPrefixes.some(prefix => customId.startsWith(prefix)) ||
        customId === 'content-help';
} 