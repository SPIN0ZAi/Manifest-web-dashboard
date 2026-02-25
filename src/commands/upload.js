import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { validateAppId } from '../utils/steam.js';
import { updateOrCreateBranch } from '../utils/github.js';
import { cleanLuaContent } from '../utils/luaCleaner.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import fetch from 'node-fetch';
import { emojis } from '../utils/emojis.js';
import { getDepotKey } from '../utils/depotKeys.js';
import { broadcastGameAlert, broadcastUpdatedGameAlert } from '../utils/alerts.js';
import { setStoredBuildVersion } from '../utils/manifestProcessor.js';

import { getServerType, SERVER_TYPES } from '../utils/serverManager.js';

export const data = new SlashCommandBuilder()
    .setName('upload')
    .setDescription('Upload a manifest file for a Steam game')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option.setName('appid')
            .setDescription('The Steam AppID of the game')
            .setRequired(true))
    .addAttachmentOption(option =>
        option.setName('manifest')
            .setDescription('The manifest file to upload')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('key')
            .setDescription('The depot key to use for this manifest')
            .setRequired(false));

async function downloadFile(url, dest) {
    const response = await fetch(url);
    const fileStream = fs.createWriteStream(dest);
    await pipeline(response.body, fileStream);
}

async function updateDepotKey(depotId, key) {
    const keysPath = path.join(process.cwd(), 'keys', 'depotkeys.json');
    let depotKeys = {};
    
    // Read existing keys if file exists
    try {
        const content = await fs.promises.readFile(keysPath, 'utf8');
        depotKeys = JSON.parse(content);
    } catch (error) {
        // File doesn't exist or is invalid, start with empty object
        console.log('Creating new depotkeys.json file');
    }

    // Update or add the new key
    depotKeys[depotId] = key;

    // Write back to file
    await fs.promises.mkdir(path.dirname(keysPath), { recursive: true });
    await fs.promises.writeFile(keysPath, JSON.stringify(depotKeys, null, 2), 'utf8');
}

function extractManifestInfo(filename, content) {
    // Try to extract from filename first (format: depotid_manifestid.manifest)
    const filenameMatch = filename.match(/^(\d+)_(\d+)\.manifest$/);
    if (filenameMatch) {
        return {
            depotId: filenameMatch[1],
            manifestId: filenameMatch[2]
        };
    }

    // Fall back to content extraction
    const manifestIdMatch = content.toString('utf8').match(/setManifestId\s*\(\s*\d+\s*,\s*"(\d+)"\s*\)/i);
    if (manifestIdMatch) {
        return {
            manifestId: manifestIdMatch[1]
        };
    }

    return null;
}

export async function execute(interaction) {
    // Security check: Only allow this command in the safe guild
    const serverType = getServerType(interaction.guildId);
    if (serverType !== SERVER_TYPES.SAFE) {
        console.log(`[SECURITY] Denied /upload to ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId} - not safe guild (type: ${serverType})`);
        return interaction.reply({ 
            content: '❌ This command is only available in the safe server.', 
            ephemeral: true 
        });
    }

    try {
        await interaction.deferReply();

        const appId = interaction.options.getString('appid');
        const manifestAttachment = interaction.options.getAttachment('manifest');
        const providedKey = interaction.options.getString('key');

        // Validate file extension
        if (!manifestAttachment.name.endsWith('.manifest')) {
            throw new Error('Please upload a .manifest file');
        }

        let gameData, gameName;
        try {
            gameData = await validateAppId(appId);
            gameName = gameData.name;
        } catch (err) {
            // Try to fetch the name from Steam API even for mods/DLCs
            try {
                const axios = (await import('axios')).default;
                const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                    params: { appids: appId, cc: 'us', l: 'en' },
                    timeout: 15000
                });
                const appData = response.data[appId];
                if (appData && appData.success && appData.data && appData.data.name) {
                    gameData = { appid: appId, name: appData.data.name };
                    gameName = appData.data.name;
                } else {
                    gameData = { appid: appId, name: 'Unknown Game' };
                    gameName = 'Unknown Game';
                }
            } catch {
                gameData = { appid: appId, name: 'Unknown Game' };
                gameName = 'Unknown Game';
            }
        }

        // Create temp directory
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-'));
        const manifestPath = path.join(tempDir, manifestAttachment.name);

        try {
            // Download the manifest file
            await downloadFile(manifestAttachment.url, manifestPath);

            // Read the manifest file as binary
            const manifestContent = await fs.promises.readFile(manifestPath);

            // Extract manifest info from filename or content
            const manifestInfo = extractManifestInfo(manifestAttachment.name, manifestContent);
            
            if (!manifestInfo || !manifestInfo.manifestId) {
                throw new Error('Could not extract manifest ID from the file. Please check if the file is valid.');
            }

            // Get depot ID - either from filename or fallback to appId + "1"
            const depotId = manifestInfo.depotId || `${appId}1`;
            let depotKey = providedKey;

            if (!depotKey) {
                // If no key provided, try to get existing key
                depotKey = await getDepotKey(depotId);
                if (!depotKey) {
                    throw new Error(`No depot key provided and no existing key found for depot ${depotId}. Please provide a key.`);
                }
            } else {
                // If key provided, update depotkeys.json
                await updateDepotKey(depotId, depotKey);
            }

            // Try to extract build version from manifest content
            let buildVersion = null;
            // Try to find a buildid in the manifest (common in Steam manifests)
            const buildIdMatch = manifestContent.toString('utf8').match(/"buildid"\s+"?(\d+)"?/i);
            if (buildIdMatch) {
                buildVersion = buildIdMatch[1];
            }
            // Store the build version if found
            if (buildVersion) {
                setStoredBuildVersion(appId, buildVersion);
            }

            // Create the .lua file content
            const luaContent = `-- =========================================================
--  This file was generated by SB manifest.
--  No one has the right to distribute or take credit for this file.
--  Personal use and sharing with friends is allowed.
--  Owner: SB
-- =========================================================
-- Generated Lua Manifest by SB manifest
-- AppID ${appId}
-- Name: ${gameName}
addappid(${appId}) -- ${gameName}
addappid(${depotId},0,"${depotKey}") -- Main Game Content
setManifestid(${depotId},"${manifestInfo.manifestId}")`;

            // Prepare files for upload
            const files = [
                {
                    name: `${appId}.lua`,
                    content: Buffer.from(luaContent, 'utf8'),
                    isText: true
                },
                {
                    name: manifestAttachment.name,
                    content: manifestContent,
                    isText: false
                }
            ];

            // Upload to GitHub
            const uploadResult = await updateOrCreateBranch(appId, files);

            // Broadcast alert if this is a new game
            if (uploadResult.isNewGame) {
                await broadcastGameAlert(interaction.client, gameData, 0, appId, interaction.user);
            } else {
                await broadcastUpdatedGameAlert(interaction.client, gameData, 0, appId, interaction.user);
            }

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setTitle(`${emojis.Success} ${uploadResult.isNewGame ? 'Game Added' : 'Game Updated'}`)
                .setColor(0x00FF00)
                .addFields(
                    { name: `${emojis.GENRES} Game`, value: gameName, inline: true },
                    { name: `${emojis.AppID} AppID`, value: appId, inline: true },
                    { name: `${emojis.Hint} Depot ID`, value: depotId, inline: true },
                    { name: `${emojis.Hint} Manifest ID`, value: manifestInfo.manifestId, inline: true },
                    { name: '🛠️ Build Version', value: buildVersion || 'N/A', inline: true },
                    { name: `${emojis.File_Size} Files`, value: files.map(f => f.name).join('\n'), inline: false }
                );

            if (providedKey) {
                successEmbed.addFields({
                    name: `${emojis.Success} Depot Key`,
                    value: 'Key has been added to depotkeys.json',
                    inline: false
                });
            }

            successEmbed.setTimestamp();
            await interaction.editReply({ embeds: [successEmbed] });

        } finally {
            // Clean up temp directory
            try {
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.error('Failed to clean up temp directory:', error);
            }
        }

    } catch (error) {
        console.error('Error in upload command:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Error} Upload Failed`)
            .setDescription(error.message)
            .setColor(0xFF0000)
            .setTimestamp();
        
        if (!interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}