import { EmbedBuilder } from 'discord.js';
import { getDb } from './database.js';
import { emojis } from './emojis.js';

function getStorageRequirement(requirements) {
    if (!requirements?.minimum) return null;
    const regex = /<strong>Storage:<\/strong>\s*(\d+\s*(?:GB|MB|TB))/i;
    const match = requirements.minimum.match(regex);
    return match?.[1] || null;
}

export async function sendGameAlert(guildId, gameData, zipSizeMB, appId, user) {
    try {
        console.log(`Attempting to send alert for AppID ${appId} in guild ${guildId}`);
        
        const db = await getDb();
        const guildSettings = await db.collection('settings').findOne({ guildId });
        
        console.log('Guild settings:', guildSettings);
        
        // Check for alertsChannel (not alertChannelId)
        if (!guildSettings?.alertsChannel) {
            console.log('No alerts channel configured for this guild');
            return;
        }
        
        console.log(`Fetching channel with ID: ${guildSettings.alertsChannel}`);
        
        const channel = await user.client.channels.fetch(guildSettings.alertsChannel).catch((error) => {
            console.error('Error fetching channel:', error);
            return null;
        });
        
        if (!channel) {
            console.log('Could not fetch the alerts channel');
            return;
        }
        
        console.log(`Successfully fetched channel: ${channel.name}`);

        // Find the original requester for this appId
        let originalRequester = null;
        try {
            const request = await db.collection('requests').findOne(
                { appId: String(appId) },
                { sort: { timestamp: 1 } }
            );
            if (request && request.userId) {
                originalRequester = request.userId;
            }
        } catch (e) {
            console.error('Error fetching original requester:', e);
        }
        
        // Create comprehensive embed similar to gen command
        const embed = new EmbedBuilder()
            .setTitle(`${emojis.New} New Game Added: ${gameData.name || 'Unknown Game'}`)
            .setColor(0x57F287) // Green color for success
            .setThumbnail(gameData.header_image)
            .setImage(gameData.header_image); // Add the main image like in gen command

        const storage = getStorageRequirement(gameData.pc_requirements);

        const fields = [
            { name: `${emojis.AppID} App ID`, value: String(appId), inline: true },
            { name: `${emojis.File_Size} File Size`, value: String(`${zipSizeMB.toFixed(2)} MB`), inline: true },
            { name: `${emojis.Price} Price`, value: String(gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A')), inline: true },
            { name: `${emojis.Requester} Added by`, value: user.toString(), inline: true },
            { name: `${emojis.New} Status`, value: 'Newly Added', inline: true },
        ];

        if (originalRequester) {
            fields.push({ name: `${emojis.Requester} Original Requester`, value: `<@${originalRequester}>`, inline: true });
        }
        
        if(storage) {
            fields.push({ name: `${emojis.Storage} Game Size`, value: storage, inline: true });
        }

        fields.push({ name: `${emojis.Online} Online Support`, value: String((gameData.categories?.some(c => c.description === 'Multi-player') ?? false) ? 'Yes' : 'No'), inline: false });
        
        const genres = gameData.genres?.map(g => g.description).join(', ');
        if (genres) {
            fields.push({ name: `${emojis.GENRES} Genres`, value: String(genres), inline: false });
        }

        const description = gameData.short_description?.replace(/<[^>]*>?/gm, '');
        if (description) {
            fields.push({ name: `${emojis.DESCRIPTION} Description`, value: String(description.slice(0, 1024)), inline: false });
        }
        
        embed.addFields(fields);
        embed.setTimestamp();
        
        // Check if there's an alerts role to ping
        let content = null;
        if (guildSettings.alertsRole) {
            if (guildSettings.alertsRole === 'everyone') {
                content = '@everyone';
            } else {
                content = `<@&${guildSettings.alertsRole}>`;
            }
        }
        // Tag the original requester in the message content if found
        if (originalRequester) {
            content = (content ? content + ' ' : '') + `<@${originalRequester}>`;
        }
        
        console.log('Sending enhanced alert message...');
        await channel.send({ 
            content: content,
            embeds: [embed] 
        });
        
        console.log(`Enhanced alert sent successfully for ${gameData.name || 'Unknown Game'}`);
    } catch (error) {
        console.error('Error sending game alert:', error);
    }
}

export async function sendUpdatedGameAlert(guildId, gameData, zipSizeMB, appId, user) {
    try {
        console.log(`Attempting to send UPDATED alert for AppID ${appId} in guild ${guildId}`);
        
        const db = await getDb();
        const guildSettings = await db.collection('settings').findOne({ guildId });
        
        // Prefer updatedGameChannel, fallback to alertsChannel
        const channelId = guildSettings?.updatedGameChannel || guildSettings?.alertsChannel;
        if (!channelId) {
            console.log('No updated or alerts channel configured for this guild');
            return;
        }
        
        const channel = await user.client.channels.fetch(channelId).catch((error) => {
            console.error('Error fetching channel:', error);
            return null;
        });
        if (!channel) {
            console.log('Could not fetch the updated/alerts channel');
            return;
        }

        // Find the original requester for this appId
        let originalRequester = null;
        try {
            const request = await db.collection('requests').findOne(
                { appId: String(appId) },
                { sort: { timestamp: 1 } }
            );
            if (request && request.userId) {
                originalRequester = request.userId;
            }
        } catch (e) {
            console.error('Error fetching original requester:', e);
        }

        // Build embed for updated game
        const embed = new EmbedBuilder()
            .setTitle(`🔄 Game updated: ${gameData.name || 'Unknown Game'} (AppID: ${appId})`)
            .setColor(0x5865F2) // Discord blurple for update
            .setThumbnail(gameData.header_image)
            .setImage(gameData.header_image);

        const storage = getStorageRequirement(gameData.pc_requirements);
        const fields = [
            { name: `${emojis.AppID} App ID`, value: String(appId), inline: true },
            { name: `${emojis.File_Size} File Size`, value: String(`${zipSizeMB.toFixed(2)} MB`), inline: true },
            { name: `${emojis.Price} Price`, value: String(gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A')), inline: true },
            { name: `${emojis.Requester} Updated by`, value: user.toString(), inline: true },
            { name: `${emojis.New} Status`, value: 'Updated', inline: true },
        ];
        if (originalRequester) {
            fields.push({ name: `${emojis.Requester} Original Requester`, value: `<@${originalRequester}>`, inline: true });
        }
        if (storage) {
            fields.push({ name: `${emojis.Storage} Game Size`, value: storage, inline: true });
        }
        fields.push({ name: `${emojis.Online} Online Support`, value: String((gameData.categories?.some(c => c.description === 'Multi-player') ?? false) ? 'Yes' : 'No'), inline: false });
        const genres = gameData.genres?.map(g => g.description).join(', ');
        if (genres) {
            fields.push({ name: `${emojis.GENRES} Genres`, value: String(genres), inline: false });
        }
        const description = gameData.short_description?.replace(/<[^>]*>?/gm, '');
        if (description) {
            fields.push({ name: `${emojis.DESCRIPTION} Description`, value: String(description.slice(0, 1024)), inline: false });
        }
        embed.addFields(fields);
        embed.setTimestamp();

        // Check if there's an alerts role to ping
        let content = null;
        if (guildSettings.alertsRole) {
            if (guildSettings.alertsRole === 'everyone') {
                content = '@everyone';
            } else {
                content = `<@&${guildSettings.alertsRole}>`;
            }
        }
        // Tag the original requester in the message content if found
        if (originalRequester) {
            content = (content ? content + ' ' : '') + `<@${originalRequester}>`;
        }

        await channel.send({
            content: content,
            embeds: [embed]
        });
        console.log(`Updated game alert sent successfully for ${gameData.name || 'Unknown Game'}`);
    } catch (error) {
        console.error('Error sending updated game alert:', error);
    }
}

export async function broadcastGameAlert(client, gameData, zipSizeMB, appId, user) {
    try {
        const db = await getDb();
        const settingsCursor = db.collection('settings').find({ alertsChannel: { $exists: true, $ne: null } });
        let sentCount = 0;
        for await (const guildSettings of settingsCursor) {
            try {
                const channel = await client.channels.fetch(guildSettings.alertsChannel).catch(() => null);
                if (!channel) continue;

                // Find the original requester for this appId
                let originalRequester = null;
                try {
                    const request = await db.collection('requests').findOne(
                        { appId: String(appId) },
                        { sort: { timestamp: 1 } }
                    );
                    if (request && request.userId) {
                        originalRequester = request.userId;
                    }
                } catch (e) {}

                // Build embed (reuse logic from sendGameAlert)
                const embed = new EmbedBuilder()
                    .setTitle(`${emojis.New} New Game Added: ${gameData.name || 'Unknown Game'}`)
                    .setColor(0x57F287)
                    .setThumbnail(gameData.header_image)
                    .setImage(gameData.header_image);

                const storage = getStorageRequirement(gameData.pc_requirements);
                const fields = [
                    { name: `${emojis.AppID} App ID`, value: String(appId), inline: true },
                    { name: `${emojis.File_Size} File Size`, value: String(`${zipSizeMB.toFixed(2)} MB`), inline: true },
                    { name: `${emojis.Price} Price`, value: String(gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A')), inline: true },
                    { name: `${emojis.Requester} Added by`, value: user.toString(), inline: true },
                    { name: `${emojis.New} Status`, value: 'Newly Added', inline: true },
                ];
                if (originalRequester) {
                    fields.push({ name: `${emojis.Requester} Original Requester`, value: `<@${originalRequester}>`, inline: true });
                }
                if (storage) {
                    fields.push({ name: `${emojis.Storage} Game Size`, value: storage, inline: true });
                }
                fields.push({ name: `${emojis.Online} Online Support`, value: String((gameData.categories?.some(c => c.description === 'Multi-player') ?? false) ? 'Yes' : 'No'), inline: false });
                const genres = gameData.genres?.map(g => g.description).join(', ');
                if (genres) {
                    fields.push({ name: `${emojis.GENRES} Genres`, value: String(genres), inline: false });
                }
                const description = gameData.short_description?.replace(/<[^>]*>?/gm, '');
                if (description) {
                    fields.push({ name: `${emojis.DESCRIPTION} Description`, value: String(description.slice(0, 1024)), inline: false });
                }
                embed.addFields(fields);
                embed.setTimestamp();

                // Check if there's an alerts role to ping
                let content = null;
                if (guildSettings.alertsRole) {
                    if (guildSettings.alertsRole === 'everyone') {
                        content = '@everyone';
                    } else {
                        content = `<@&${guildSettings.alertsRole}>`;
                    }
                }
                if (originalRequester) {
                    content = (content ? content + ' ' : '') + `<@${originalRequester}>`;
                }

                await channel.send({ content, embeds: [embed] });
                sentCount++;
            } catch (err) {
                console.error(`Failed to send broadcast alert for AppID ${appId} to guild ${guildSettings.guildId}:`, err);
            }
        }
        return sentCount;
    } catch (error) {
        console.error('Error broadcasting game alert:', error);
        return 0;
    }
}

export async function broadcastUpdatedGameAlert(client, gameData, zipSizeMB, appId, user) {
    try {
        const db = await getDb();
        const settingsCursor = db.collection('settings').find({
            $or: [
                { updatedGameChannel: { $exists: true, $ne: null } },
                { alertsChannel: { $exists: true, $ne: null } }
            ]
        });
        let sentCount = 0;
        for await (const guildSettings of settingsCursor) {
            try {
                const channelId = guildSettings.updatedGameChannel || guildSettings.alertsChannel;
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) continue;

                // Find the original requester for this appId
                let originalRequester = null;
                try {
                    const request = await db.collection('requests').findOne(
                        { appId: String(appId) },
                        { sort: { timestamp: 1 } }
                    );
                    if (request && request.userId) {
                        originalRequester = request.userId;
                    }
                } catch (e) {}

                // Build embed (reuse logic from sendUpdatedGameAlert)
                const embed = new EmbedBuilder()
                    .setTitle(`🔄 Game updated: ${gameData.name || 'Unknown Game'} (AppID: ${appId})`)
                    .setColor(0x5865F2)
                    .setThumbnail(gameData.header_image)
                    .setImage(gameData.header_image);

                const storage = getStorageRequirement(gameData.pc_requirements);
                const fields = [
                    { name: `${emojis.AppID} App ID`, value: String(appId), inline: true },
                    { name: `${emojis.File_Size} File Size`, value: String(`${zipSizeMB.toFixed(2)} MB`), inline: true },
                    { name: `${emojis.Price} Price`, value: String(gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A')), inline: true },
                    { name: `${emojis.Requester} Updated by`, value: user.toString(), inline: true },
                    { name: `${emojis.New} Status`, value: 'Updated', inline: true },
                ];
                if (originalRequester) {
                    fields.push({ name: `${emojis.Requester} Original Requester`, value: `<@${originalRequester}>`, inline: true });
                }
                if (storage) {
                    fields.push({ name: `${emojis.Storage} Game Size`, value: storage, inline: true });
                }
                fields.push({ name: `${emojis.Online} Online Support`, value: String((gameData.categories?.some(c => c.description === 'Multi-player') ?? false) ? 'Yes' : 'No'), inline: false });
                const genres = gameData.genres?.map(g => g.description).join(', ');
                if (genres) {
                    fields.push({ name: `${emojis.GENRES} Genres`, value: String(genres), inline: false });
                }
                const description = gameData.short_description?.replace(/<[^>]*>?/gm, '');
                if (description) {
                    fields.push({ name: `${emojis.DESCRIPTION} Description`, value: String(description.slice(0, 1024)), inline: false });
                }
                embed.addFields(fields);
                embed.setTimestamp();

                // Check if there's an alerts role to ping
                let content = null;
                if (guildSettings.alertsRole) {
                    if (guildSettings.alertsRole === 'everyone') {
                        content = '@everyone';
                    } else {
                        content = `<@&${guildSettings.alertsRole}>`;
                    }
                }
                if (originalRequester) {
                    content = (content ? content + ' ' : '') + `<@${originalRequester}>`;
                }

                await channel.send({ content, embeds: [embed] });
                sentCount++;
            } catch (err) {
                console.error(`Failed to send broadcast updated alert for AppID ${appId} to guild ${guildSettings.guildId}:`, err);
            }
        }
        return sentCount;
    } catch (error) {
        console.error('Error broadcasting updated game alert:', error);
        return 0;
    }
}