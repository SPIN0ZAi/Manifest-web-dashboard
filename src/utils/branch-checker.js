import { EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { validateAppId } from './steam.js';
import { getDb } from './database.js';
import { fetchFilesFromRepo } from './github.js';
import { t } from './localization.js';
import { emojis } from './emojis.js';
import { getServersWithAlerts } from './serverManager.js';

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'SPIN0ZAi';
const REPO_NAME = 'SB_manifest_DB';

async function getCachedBranch(appid) {
    const db = await getDb();
    const result = await db.collection('branches').findOne({ _id: 'branch-cache', branches: appid });
    return !!result;
}

async function addBranchToCache(appid) {
    const db = await getDb();
    await db.collection('branches').updateOne(
        { _id: 'branch-cache' },
        { $addToSet: { branches: appid } },
        { upsert: true }
    );
}
/**
 * Checks a specific AppID, and if it's a new, valid game with a corresponding branch,
 * announces it to all servers that have an alerts channel configured.
 * @param {import('discord.js').Client} client The Discord client instance.
 * @param {string} appid The AppID to check and announce.
 * @returns {Promise<string>} A status message indicating the result.
 */
export async function announceAppId(client, appid) {
    // 1. Check if it's already in our database/cache
    const isCached = await getCachedBranch(appid);
    if (isCached) {
        return `The AppID \`${appid}\` has already been announced previously.`;
    }

    // 2. Check if a branch exists for the AppID on GitHub
    try {
        await fetchFilesFromRepo(appid);
    } catch (error) {
        // This also handles the 404 case
        return `Could not find a corresponding branch or files for AppID \`${appid}\` in the GitHub repository.`;
    }

    // 3. Validate it's a real game on Steam
    let gameData;
    try {
        gameData = await validateAppId(appid);
    } catch(error) {
        return `The AppID \`${appid}\` is not a valid game on Steam. ${error.message}`;
    }

    // 4. Get the original requester if available
    const db = await getDb();
    const request = await db.collection('requests')
        .findOne({ appId: appid }, { sort: { timestamp: 1 } }); // Get earliest request

    // 5. Announce to all relevant guilds
    const serversWithAlerts = await getServersWithAlerts();
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`${emojis.Upload} ${gameData.name}`)
        .setURL(`https://store.steampowered.com/app/${appid}`)
        .setDescription(`${emojis.DESCRIPTION} ${gameData.short_description || 'No description available.'}`)
        .addFields(
            { name: `${emojis.AppID} AppID`, value: `\`${appid}\``, inline: true },
            { name: `${emojis.Price} Price`, value: gameData.price_overview?.final_formatted || 'Unknown', inline: true },
            { name: `${emojis.Online} Support Online`, value: String((gameData.categories?.some(c => c.description === 'Multi-player') ?? false) ? 'Yes' : 'No'), inline: false }
        );

    // Add requester field if available
    if (request) {
        embed.addFields({ 
            name: `${emojis.Requester} Original Requester`, 
            value: `<@${request.userId}>`, 
            inline: true 
        });
    }

    // Add release date
    embed.addFields({ 
        name: `${emojis.Time} Release Date`, 
        value: gameData.release_date?.date || 'Unknown', 
        inline: true 
    });

    embed.setThumbnail(gameData.header_image)
        .setImage(gameData.header_image)
        .setTimestamp()
        .setFooter({ text: 'SB manifest | New Game Added' });

    let announcedCount = 0;
    for (const settingsDoc of serversWithAlerts) {
        try {
            const channel = await client.channels.fetch(settingsDoc.alertsChannel);
            if (channel) {
                const alertRoleIdentifier = settingsDoc.alertsRole;
                const messagePayload = { embeds: [embed] };

                if (alertRoleIdentifier) {
                    if (alertRoleIdentifier === 'everyone') {
                        messagePayload.content = '@everyone';
                        messagePayload.allowedMentions = { parse: ['everyone'] };
                    } else {
                        messagePayload.content = `<@&${alertRoleIdentifier}>`;
                    }
                }
                
                await channel.send(messagePayload);
                announcedCount++;
            }
        } catch (error) {
            console.error(`Failed to send alert for ${appid} to guild ${settingsDoc.guildId}:`, error);
        }
    }
    
    // 6. Add to cache if announced anywhere
    if (announcedCount > 0) {
        await addBranchToCache(appid);
        return `Successfully announced **${gameData.name}** (\`${appid}\`) to ${announcedCount} server(s).`;
    } else {
        return 'The AppID is valid, but no servers have configured an alerts channel.';
    }
}

async function fetchAllBranches() {
    let branches = [];
    let page = 1;
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/branches`;

    while (true) {
        try {
            const response = await axios.get(url, {
                params: { per_page: 100, page },
                headers: { 'Accept': 'application/vnd.github.v3+json', ...(process.env.GITHUB_TOKEN && {'Authorization': `token ${process.env.GITHUB_TOKEN}`}) }
            });
            if (response.data.length === 0) break;
            branches = branches.concat(response.data.map(branch => branch.name));
            page++;
        } catch (error) {
            console.error('Failed to fetch branches from GitHub:', error.message);
            return null;
        }
    }
    return branches;
}

export async function checkForNewBranches(client) {
    console.log('Scheduled Check: Fetching branches from GitHub...');
    try {
        const remoteBranches = await fetchAllBranches();
        if (remoteBranches === null) {
            console.log('Scheduled Check: Aborting due to error fetching branches.');
            return;
        }

        // Filter for numeric branches and rely on announceAppId's internal cache check.
        const numericBranches = remoteBranches.filter(branch => /^\d+$/.test(branch));
        
        if (numericBranches.length > 0) {
            console.log(`Scheduled Check: Found ${numericBranches.length} potential app(s) to process.`);

            const chunkSize = 10;
            let totalAnnounced = 0;
            let totalAlreadyAnnounced = 0;

            for (let i = 0; i < numericBranches.length; i += chunkSize) {
                const chunk = numericBranches.slice(i, i + chunkSize);
                console.log(`Scheduled Check: Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(numericBranches.length / chunkSize)}...`);

                const results = await Promise.allSettled(chunk.map(branch => announceAppId(client, branch)));

                results.forEach(result => {
                    if (result.status === 'fulfilled') {
                        if (result.value.includes('Successfully announced')) {
                            console.log(`Scheduled Check Result: ${result.value}`);
                            totalAnnounced++;
                        } else if (result.value.includes('already been announced')) {
                            totalAlreadyAnnounced++;
                        } else {
                            console.log(`Scheduled Check Result: ${result.value}`);
                        }
                    } else {
                        console.error(`Scheduled Check Failed: ${result.reason}`);
                    }
                });

                // Pause between chunks to yield to the event loop
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            console.log(`Scheduled Check Complete: Announced ${totalAnnounced} new app(s). Found ${totalAlreadyAnnounced} already announced. Checked ${numericBranches.length} total.`);
        } else {
            console.log('Scheduled Check: No numeric branches found to process.');
        }
    } catch (error) {
        console.error('Scheduled Check Failed:', error);
    }
} 