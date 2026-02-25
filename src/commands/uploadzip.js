import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { Octokit } from '@octokit/rest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import { validateAppId } from '../utils/steam.js';
import { cleanLuaContent } from '../utils/luaCleaner.js';
import { updateOrCreateBranch, branchExists } from '../utils/github.js';
import { getDepotKey } from '../utils/depotKeys.js';
import { sendGameAlert, sendUpdatedGameAlert, broadcastGameAlert, broadcastUpdatedGameAlert } from '../utils/alerts.js';
import { emojis } from '../utils/emojis.js';
import { setStoredBuildVersion } from '../utils/manifestProcessor.js';

const streamPipeline = promisify(pipeline);

// Initialize Octokit with the upload-specific token
let octokit = null;
let REPO_OWNER = null;
let REPO_NAME = null;

// Safe guild ID where sensitive commands are allowed
const SAFE_GUILD_ID = '1317915330084995163';

// Initialize GitHub configuration
function initializeGitHubConfig() {
    if (!process.env.GITHUB_UPLOAD_TOKEN) {
        throw new Error('GITHUB_UPLOAD_TOKEN environment variable is not set');
    }
    if (!process.env.GITHUB_REPO_OWNER) {
        throw new Error('GITHUB_REPO_OWNER environment variable is not set');
    }
    if (!process.env.GITHUB_UPLOAD_REPO_NAME) {
        throw new Error('GITHUB_UPLOAD_REPO_NAME environment variable is not set');
    }

    octokit = new Octokit({
        auth: process.env.GITHUB_UPLOAD_TOKEN
    });
    REPO_OWNER = process.env.GITHUB_REPO_OWNER;
    REPO_NAME = process.env.GITHUB_UPLOAD_REPO_NAME;
}

export const data = new SlashCommandBuilder()
    .setName('uploadzip')
    .setDescription('Upload a ZIP file containing .lua and .manifest files')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
        option.setName('zipfile')
            .setDescription('The ZIP file containing .lua and .manifest files')
            .setRequired(true));

async function downloadFile(url, filePath) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    await streamPipeline(response.body, fs.createWriteStream(filePath));
}

function extractAppIdFromFileName(fileName) {
    // Extract AppID from filename (format: appid.lua or anything containing the appid)
    const match = fileName.match(/(\d+)\.lua$/);
    if (!match) {
        throw new Error('Could not extract AppID from .lua filename. File should be named [appid].lua');
    }
    return match[1];
}

function calculateZipSize(files) {
    return files.reduce((total, file) => total + file.content.length, 0) / (1024 * 1024);
}

function extractManifestInfo(fileName, binaryContent) {
    console.log(`Extracting manifest info from: ${fileName}`);

    // Try to extract from filename first (format: depotid_manifestid.manifest)
    const filenameMatch = fileName.match(/^(\d+)_(\d+)\.manifest$/);
    if (filenameMatch) {
        console.log(`Extracted from filename - Depot ID: ${filenameMatch[1]}, Manifest ID: ${filenameMatch[2]}`);
        return {
            depotId: filenameMatch[1],
            manifestId: filenameMatch[2]
        };
    }

    // Try alternative filename patterns
    const altMatch = fileName.match(/(\d+)\.manifest$/);
    if (altMatch) {
        // Try to read the content carefully for manifest ID
        try {
            // Only read first 1024 bytes to avoid memory issues and look for patterns
            const sampleContent = binaryContent.slice(0, 1024).toString('utf8', 0, 1024);
            const manifestIdMatch = sampleContent.match(/(\d{10,})/); // Look for long numbers that could be manifest IDs
            if (manifestIdMatch) {
                console.log(`Extracted from content sample - Depot ID: ${altMatch[1]}, Manifest ID: ${manifestIdMatch[1]}`);
                return {
                    depotId: altMatch[1],
                    manifestId: manifestIdMatch[1]
                };
            }
        } catch (error) {
            console.warn(`Could not extract from content for ${fileName}:`, error.message);
        }
    }

    console.warn(`Could not extract manifest info from ${fileName}`);
    return null;
}

function extractDepotKeysFromLua(luaContent) {
    const depotKeys = {};
    const lines = luaContent.split('\n');

    for (const line of lines) {
        // Match patterns like: addappid(1234567,0,"ABC123XYZ") -- comment
        const match = line.match(/addappid\s*\(\s*(\d+)\s*,\s*\d+\s*,\s*["']([^"']+)["']\s*\)/);
        if (match) {
            const depotId = match[1];
            const depotKey = match[2];
            depotKeys[depotId] = depotKey;
        }
    }

    return depotKeys;
}

export async function processZipFile(tempPath) {
    const zip = new AdmZip(tempPath);

    // Get entries and ensure we're working with raw buffers
    const entries = zip.getEntries();

    const luaFiles = entries.filter(entry => !entry.isDirectory && entry.entryName.endsWith('.lua'));
    const manifestFiles = entries.filter(entry => !entry.isDirectory && entry.entryName.endsWith('.manifest'));
    // Include depotkeys.json and appaccesstokens.json if present
    const jsonDataFiles = entries.filter(entry => {
        if (entry.isDirectory) return false;
        const baseName = entry.entryName.split('/').pop()?.toLowerCase();
        return baseName === 'depotkeys.json' || baseName === 'appaccesstokens.json';
    });

    console.log(`Found ${luaFiles.length} .lua files, ${manifestFiles.length} .manifest files, and ${jsonDataFiles.length} JSON data files`);

    if (luaFiles.length === 0) {
        throw new Error('No .lua files found in the ZIP archive');
    }

    if (manifestFiles.length === 0) {
        throw new Error('No .manifest files found in the ZIP archive');
    }

    const processedFiles = [];
    const missingDepotKeys = []; // Track missing depot keys specifically
    const errors = [];

    // Process each .lua file
    for (const luaEntry of luaFiles) {
        try {
            console.log(`Processing .lua file: ${luaEntry.entryName}`);

            // Extract AppID from .lua filename
            const appId = extractAppIdFromFileName(luaEntry.entryName);
            console.log(`Extracted AppID: ${appId}`);

            // Get game info from Steam
            let gameData, gameName;
            try {
                gameData = await validateAppId(appId);
                gameName = gameData.name;
                console.log(`Validated game: ${gameName}`);
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
                        console.warn(`Fetched name for non-game AppID ${appId}: ${gameName}`);
                    } else {
                        gameData = { appid: appId, name: 'Unknown Game' };
                        gameName = 'Unknown Game';
                    }
                } catch {
                    gameData = { appid: appId, name: 'Unknown Game' };
                    gameName = 'Unknown Game';
                }
            }

            // Read the .lua file content to extract depot keys AND depot IDs
            const luaContent = luaEntry.getData().toString('utf8');
            const luaDepotKeys = extractDepotKeysFromLua(luaContent);
            console.log(`Extracted ${Object.keys(luaDepotKeys).length} depot keys from .lua file:`, luaDepotKeys);

            // Extract ALL depot/app IDs referenced in the Lua file
            const luaReferencedIds = new Set();
            const idRegex = /(?:addappid|setManifestid|addtoken)\s*\(\s*(\d+)/g;
            let idMatch;
            while ((idMatch = idRegex.exec(luaContent)) !== null) {
                luaReferencedIds.add(idMatch[1]);
            }
            console.log(`Found ${luaReferencedIds.size} referenced IDs in Lua:`, [...luaReferencedIds]);

            // Find manifest files that belong to this game:
            // 1. Depot ID in the filename matches an ID in the Lua file
            // 2. OR filename contains the AppID directly
            const potentialManifests = manifestFiles.filter(manifest => {
                const baseName = manifest.entryName.split('/').pop() || manifest.entryName;
                const depotMatch = baseName.match(/^(\d+)_\d+\.manifest$/);
                if (depotMatch) {
                    // Check if the depot ID is referenced in the Lua
                    return luaReferencedIds.has(depotMatch[1]);
                }
                // Fallback: check if filename contains the appId
                return baseName.includes(appId);
            });

            console.log(`Found ${potentialManifests.length} matching manifest files for AppID ${appId}`);

            if (potentialManifests.length === 0) {
                console.warn(`No manifest files found for AppID ${appId}`);
                errors.push(`No manifest files found for AppID ${appId}`);
                continue;
            }

            // Process ALL manifest files as pure binary
            const manifestBuffers = [];
            const manifestErrors = [];
            const gameMissingDepotKeys = [];

            for (const manifest of potentialManifests) {
                try {
                    console.log(`Processing manifest: ${manifest.entryName}`);

                    // Get raw binary buffer - NO string conversion
                    const rawBuffer = manifest.getData();

                    if (!rawBuffer || rawBuffer.length === 0) {
                        throw new Error(`Empty or invalid manifest file: ${manifest.entryName}`);
                    }

                    console.log(`Manifest ${manifest.entryName}: ${rawBuffer.length} bytes (binary)`);

                    // Extract manifest info
                    let manifestInfo = extractManifestInfo(manifest.entryName, rawBuffer);

                    if (!manifestInfo) {
                        console.warn(`Could not extract manifest info from ${manifest.entryName}, using defaults`);
                        // Create a fallback manifest info
                        const fallbackDepotId = `${appId}1`;
                        const fallbackManifestId = Date.now().toString(); // Use timestamp as fallback
                        manifestInfo = {
                            depotId: fallbackDepotId,
                            manifestId: fallbackManifestId
                        };
                    }

                    // First try to get depot key from the .lua file (preferred method)
                    let depotKey = luaDepotKeys[manifestInfo.depotId];

                    if (!depotKey) {
                        // Fallback: Try to get from depotkeys.json
                        depotKey = await getDepotKey(manifestInfo.depotId);
                    }

                    if (!depotKey) {
                        // Try with appId + common depot suffixes
                        const commonSuffixes = ['1', '2', '3', ''];
                        for (const suffix of commonSuffixes) {
                            const testDepotId = `${appId}${suffix}`;
                            depotKey = luaDepotKeys[testDepotId] || await getDepotKey(testDepotId);
                            if (depotKey) {
                                console.log(`Found depot key for ${testDepotId} instead of ${manifestInfo.depotId}`);
                                manifestInfo.depotId = testDepotId;
                                break;
                            }
                        }
                    }

                    if (!depotKey) {
                        console.warn(`No depot key found for depot ${manifestInfo.depotId}`);
                        gameMissingDepotKeys.push({
                            appId,
                            gameName,
                            depotId: manifestInfo.depotId,
                            manifestFile: manifest.entryName,
                            manifestId: manifestInfo.manifestId
                        });
                        continue; // Skip this manifest but continue processing others
                    }

                    manifestBuffers.push({
                        name: manifest.entryName,
                        content: rawBuffer, // Keep as binary buffer
                        isText: false,
                        depotId: manifestInfo.depotId,
                        manifestId: manifestInfo.manifestId,
                        depotKey: depotKey
                    });

                    console.log(`Successfully processed manifest ${manifest.entryName}`);
                } catch (error) {
                    console.error(`Error processing manifest ${manifest.entryName}:`, error);
                    manifestErrors.push(`${manifest.entryName}: ${error.message}`);
                }
            }

            // Add missing depot keys to the global list
            missingDepotKeys.push(...gameMissingDepotKeys);

            // Only create files if we have at least one valid manifest
            if (manifestBuffers.length > 0) {
                console.log(`Successfully processed ${manifestBuffers.length} manifests for AppID ${appId} (${gameMissingDepotKeys.length} skipped due to missing depot keys)`);

                // Use the cleanLuaContent function to preserve DLCs and comments while updating header
                const generatedLuaContent = cleanLuaContent(luaContent, gameName, appId);

                // Create files array for this appId - include ALL files
                const files = [
                    {
                        name: `${appId}.lua`,
                        content: Buffer.from(generatedLuaContent, 'utf8'),
                        isText: true
                    },
                    ...manifestBuffers.map(({ name, content, isText }) => ({
                        name: name.split('/').pop() || name, // Use just filename, not path
                        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
                        isText
                    }))
                ];

                // Include depotkeys.json and appaccesstokens.json if they exist in the ZIP
                for (const jsonFile of jsonDataFiles) {
                    try {
                        const jsonContent = jsonFile.getData();
                        if (jsonContent && jsonContent.length > 0) {
                            const baseName = jsonFile.entryName.split('/').pop() || jsonFile.entryName;
                            files.push({
                                name: baseName,
                                content: jsonContent,
                                isText: true
                            });
                            console.log(`Including ${baseName} (${jsonContent.length} bytes) from ZIP`);
                        }
                    } catch (jsonErr) {
                        console.warn(`Could not read ${jsonFile.entryName}:`, jsonErr.message);
                    }
                }

                // Verify all files have content
                const invalidFiles = files.filter(f => !f.content || f.content.length === 0);
                if (invalidFiles.length > 0) {
                    throw new Error(`Invalid files detected: ${invalidFiles.map(f => f.name).join(', ')}`);
                }

                processedFiles.push({
                    appId,
                    gameData,
                    files,
                    zipSizeMB: calculateZipSize(files),
                    manifestCount: manifestBuffers.length,
                    skippedManifests: gameMissingDepotKeys.length
                });

                console.log(`Successfully prepared AppID ${appId} with ${files.length} files (${manifestBuffers.length} manifests, ${gameMissingDepotKeys.length} skipped)`);
            } else {
                // If no manifests were processed, just log the issue but don't throw an error
                console.warn(`No valid manifests could be processed for AppID ${appId} - all missing depot keys`);
            }

        } catch (error) {
            console.error(`Error processing ${luaEntry.entryName}:`, error);
            errors.push(`${luaEntry.entryName}: ${error.message}`);
        }
    }

    return { processedFiles, errors, missingDepotKeys };
}

export async function execute(interaction) {
    // Security check: Only allow this command in the safe guild
    if (interaction.guildId !== SAFE_GUILD_ID) {
        console.log(`[SECURITY] Denied /uploadzip to ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId} - not safe guild`);
        return interaction.reply({
            content: '❌ This command is only available in the safe server.',
            ephemeral: true
        });
    }

    try {
        await interaction.deferReply();

        const zipAttachment = interaction.options.getAttachment('zipfile');

        // Validate file extension
        if (!zipAttachment.name.endsWith('.zip')) {
            throw new Error('Please upload a .zip file');
        }

        // Create temp directory
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'uploadzip-'));
        const zipPath = path.join(tempDir, zipAttachment.name);

        try {
            // Download the zip file
            const response = await fetch(zipAttachment.url);
            if (!response.ok) throw new Error(`Failed to download ZIP: ${response.statusText}`);
            await fs.promises.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));

            // Process the zip file
            const { processedFiles, errors, missingDepotKeys } = await processZipFile(zipPath);

            // Always show missing depot keys if there are any (this is the main fix)
            if (missingDepotKeys.length > 0) {
                const missingKeysEmbed = new EmbedBuilder()
                    .setTitle(`${emojis.Error} Missing Depot Keys Required`)
                    .setColor(0xFF6B00) // Orange color for warning
                    .setDescription(`Found **${missingDepotKeys.length}** manifest(s) that need depot keys. Use \`/upload\` command to add these depot keys:`)
                    .addFields(
                        missingDepotKeys.slice(0, 25).map(missing => ({
                            name: `${missing.gameName} (AppID: ${missing.appId})`,
                            value: `**Depot ID:** \`${missing.depotId}\`\n**Manifest ID:** \`${missing.manifestId}\`\n**File:** ${missing.manifestFile}`,
                            inline: true
                        }))
                    );

                if (missingDepotKeys.length > 25) {
                    missingKeysEmbed.addFields({
                        name: '⚠️ Additional Missing Keys',
                        value: `...and **${missingDepotKeys.length - 25}** more missing depot keys. Check console logs for the complete list.`,
                        inline: false
                    });
                }

                missingKeysEmbed.addFields({
                    name: '📝 How to Fix',
                    value: 'Use the `/upload` command with each **Depot ID** and its corresponding depot key to resolve these missing keys.',
                    inline: false
                });

                // Always show the missing depot keys message
                await interaction.editReply({ embeds: [missingKeysEmbed] });

                // If no files were processed successfully, stop here with just the missing keys info
                if (processedFiles.length === 0) {
                    return;
                }

                // If some files were processed, continue with upload but mention the missing keys
            }

            // Upload each set of files to GitHub and send alerts
            const uploadedGames = [];
            const uploadErrors = [];

            // Process sequentially to avoid race conditions
            for (const { appId, gameData, files, zipSizeMB, manifestCount, skippedManifests } of processedFiles) {
                try {
                    console.log(`Uploading AppID ${appId} with ${files.length} files...`);

                    // Upload to GitHub with retry logic
                    let uploadSuccess = false;
                    let retryCount = 0;
                    const maxRetries = 3;
                    let uploadResult;

                    while (!uploadSuccess && retryCount < maxRetries) {
                        try {
                            uploadResult = await updateOrCreateBranch(appId, files);
                            uploadSuccess = true;
                            console.log(`Successfully uploaded AppID ${appId} to GitHub`);
                        } catch (uploadError) {
                            retryCount++;
                            console.error(`Upload attempt ${retryCount} failed for AppID ${appId}:`, uploadError);
                            if (retryCount >= maxRetries) {
                                throw uploadError;
                            }
                            // Wait before retry
                            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                        }
                    }

                    // Use the upload result to determine if this is an update or a new game
                    const isUpdate = !uploadResult.isNewGame;

                    // Try to extract build version from manifest files
                    let buildVersion = null;
                    for (const file of files) {
                        if (file.name.endsWith('.manifest')) {
                            const buildIdMatch = file.content.toString('utf8').match(/"buildid"\s+"?(\d+)"?/i);
                            if (buildIdMatch) {
                                buildVersion = buildIdMatch[1];
                                break;
                            }
                        }
                    }
                    if (buildVersion) {
                        setStoredBuildVersion(appId, buildVersion);
                    }

                    // Send the appropriate alert
                    try {
                        if (isUpdate) {
                            await broadcastUpdatedGameAlert(interaction.client, gameData, zipSizeMB, appId, interaction.user);
                            console.log(`Successfully broadcasted UPDATED alert for AppID ${appId}`);
                        } else {
                            await broadcastGameAlert(interaction.client, gameData, zipSizeMB, appId, interaction.user);
                            console.log(`Successfully broadcasted NEW GAME alert for AppID ${appId}`);
                        }
                    } catch (alertError) {
                        console.error(`Failed to send alert for AppID ${appId}:`, alertError);
                        // Continue even if alert fails
                    }

                    uploadedGames.push({ appId, gameData, zipSizeMB, manifestCount, skippedManifests, isUpdate, buildVersion });

                } catch (error) {
                    console.error(`Error uploading AppID ${appId}:`, error);
                    uploadErrors.push(`${appId} (${gameData?.name || 'Unknown'}): ${error.message}`);
                }
            }

            // Only create success embed if we actually uploaded something
            if (uploadedGames.length > 0) {
                const newGames = uploadedGames.filter(g => !g.isUpdate).length;
                const updatedGames = uploadedGames.filter(g => g.isUpdate).length;

                let title = `${emojis.Success} Upload Success`;
                if (newGames > 0 && updatedGames === 0) {
                    title = `${emojis.Success} Games Added`;
                } else if (newGames === 0 && updatedGames > 0) {
                    title = `${emojis.Success} Games Updated`;
                } else if (newGames > 0 && updatedGames > 0) {
                    title = `${emojis.Success} Games Added & Updated`;
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setColor(0x00FF00)
                    .setDescription(`Successfully processed **${uploadedGames.length}** game(s) with **${uploadedGames.reduce((sum, g) => sum + g.manifestCount, 0)}** total manifests!`)
                    .addFields(
                        {
                            name: `${emojis.AppID} Uploaded Games`,
                            value: uploadedGames.map(({ appId, gameData, manifestCount, skippedManifests, isUpdate, buildVersion }) =>
                                `${appId} - ${gameData.name} (${manifestCount} manifests${skippedManifests > 0 ? `, ${skippedManifests} skipped` : ''}) ${isUpdate ? '🔄' : '🆕'} | 🛠️ ${buildVersion || 'N/A'}`
                            ).join('\n').slice(0, 1024),
                            inline: false
                        },
                        {
                            name: `${emojis.File_Size} Total Files`,
                            value: processedFiles.reduce((sum, { files }) => sum + files.length, 0).toString(),
                            inline: true
                        },
                        {
                            name: '🛠️ Build Version',
                            value: uploadedGames.map(g => g.buildVersion).filter(Boolean).join(', ') || 'N/A',
                            inline: true
                        },
                        {
                            name: `${emojis.New} Alerts Sent`,
                            value: uploadedGames.length.toString(),
                            inline: true
                        }
                    );

                // Add missing depot keys info if any
                if (missingDepotKeys.length > 0) {
                    successEmbed.addFields({
                        name: `${emojis.Error} Missing Depot Keys`,
                        value: `**${missingDepotKeys.length}** manifest(s) skipped due to missing depot keys. See above message for details.`,
                        inline: false
                    });
                }

                // Add other errors if any
                if (errors.length > 0 || uploadErrors.length > 0) {
                    const allErrors = [...errors, ...uploadErrors];
                    successEmbed.addFields({
                        name: `${emojis.Error} Other Warnings/Errors`,
                        value: allErrors.slice(0, 3).join('\n').slice(0, 1024) + (allErrors.length > 3 ? '\n...' : ''),
                        inline: false
                    });
                }

                successEmbed.setTimestamp();

                // If we already sent the missing depot keys message, follow up with success
                if (missingDepotKeys.length > 0) {
                    await interaction.followUp({ embeds: [successEmbed] });
                } else {
                    await interaction.editReply({ embeds: [successEmbed] });
                }
            } else if (missingDepotKeys.length === 0) {
                // If no uploads and no missing keys, then there was a different error
                throw new Error(`No games were successfully processed. Errors: ${errors.join('; ')}`);
            }
            // If missingDepotKeys.length > 0 and uploadedGames.length === 0, we already showed the missing keys message above

        } finally {
            // Clean up temp directory
            try {
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            } catch (error) {
                console.error('Failed to clean up temp directory:', error);
            }
        }

    } catch (error) {
        console.error('Upload command error:', error);

        const errorEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Error} Upload Failed`)
            .setColor(0xFF0000)
            .setDescription(error.message)
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}