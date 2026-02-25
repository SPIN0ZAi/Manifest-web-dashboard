// src/commands/gendlc.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { validateAppId } from '../utils/steam.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { createZipArchive } from '../utils/zip.js';
import { uploadFile } from '../utils/uploader.js';
import { t, getNested, locales, getLanguage } from '../utils/localization.js';
import { getDb } from '../utils/database.js';
import { checkAndUpdateUsage } from '../utils/usageTracker.js';
import { emojis } from '../utils/emojis.js';
import { getStoredBuildVersion } from '../utils/manifestProcessor.js';
import { isGameFiltered, getBaseGameIfDLC, fetchSteamStoreInfo, fetchPeakCCU, fuzzyFindGames } from '../utils/gen.js';
import { checkManifestNeedsUpdate, autoUpdateManifest } from '../utils/autoUpdater.js';
import fs from 'node:fs';
import path from 'node:path';

// Rate limiting map
const userRateLimit = new Map();

// Whitelist management
const whitelistPath = path.join(process.cwd(), 'src', 'utils', 'gameWhitelist.json');
let whitelist = [];
try {
  if (fs.existsSync(whitelistPath)) {
    whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
  }
} catch (error) {
  console.error('Failed to load whitelist:', error);
  whitelist = [];
}

function getStorageRequirement(req) {
  if (!req?.minimum) return null;
  const m = req.minimum.match(/<strong>Storage:<\/strong>\s*(\d+\s*(?:GB|MB|TB))/i);
  return m?.[1] || null;
}

async function updateStats(appId) {
  const db = await getDb();
  await db.collection('stats').updateOne(
    { appId },
    { $inc: { count: 1 } },
    { upsert: true }
  );
}

// Function to search for DLC by name in database
async function findDLCByName(dlcName) {
  const db = await getDb();
  const dlc = await db.collection('dlcs').findOne(
    { name: { $regex: new RegExp(dlcName, 'i') } },
    { sort: { lastUpdated: -1 } }
  );
  if (dlc && dlc.appId) {
    dlc.appId = dlc.appId.toString();
  }
  return dlc;
}

// Function to determine if input is an AppID (numeric) or DLC name
function isAppId(input) {
  return /^\d+$/.test(input.trim());
}

// Function to find DLC manifest in files
function findDLCManifest(files, dlcId) {
  return files.find(file => {
    const fileName = file.name;
    // Look for pattern: {dlcId}_{manifestId}.manifest
    const pattern = new RegExp(`^${dlcId}_\\d+\\.manifest$`);
    return pattern.test(fileName);
  });
}

// Function to extract manifest ID from filename
function extractManifestId(fileName) {
  const match = fileName.match(/^\d+_(\d+)\.manifest$/);
  return match ? match[1] : null;
}

// Function to validate DLC AppID and get full data including image
async function validateDLCAppId(dlcId) {
  if (!/^\d+$/.test(dlcId)) {
    throw new Error('Invalid AppID format. Please provide a numeric ID.');
  }

  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: {
        appids: dlcId,
        cc: 'us',
        l: 'en'
      },
      timeout: 15000
    });

    const appData = response.data[dlcId];

    if (!appData || !appData.success) {
      throw new Error(`No application found for AppID: ${dlcId}.`);
    }

    const data = appData.data;
    
    // Accept both 'dlc' and 'game' types for DLC command
    if (data.type !== 'dlc' && data.type !== 'game') {
      throw new Error(`AppID ${dlcId} is for a '${data.type}', not a DLC or game.`);
    }

    return data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('The request to the Steam API timed out.');
    }
    if (error.response) {
      console.error('Steam API request failed:', error.response.status, error.response.data);
      throw new Error('Failed to communicate with the Steam API.');
    }
    throw error;
  }
}

// Function to get main game ID for a DLC
async function getMainGameIdForDLC(dlcId) {
  // Get main game ID automatically from Steam API - just like main game detection
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: { appids: dlcId, cc: 'us', l: 'en' },
      timeout: 15000
    });
    
    const appData = response.data[dlcId];
    if (appData && appData.success && appData.data) {
      // Check if it has a parent app (main game)
      if (appData.data.parent_appid) {
        console.log(`Found parent app ${appData.data.parent_appid} for DLC ${dlcId}`);
        return appData.data.parent_appid.toString();
      }
      
      // Check if it has a fullgame object (some DLCs use this instead of parent_appid)
      if (appData.data.fullgame && appData.data.fullgame.appid) {
        console.log(`Found fullgame app ${appData.data.fullgame.appid} for DLC ${dlcId}`);
        return appData.data.fullgame.appid.toString();
      }
      
      // Also check if it's marked as DLC in the type
      if (appData.data.type === 'dlc' && appData.data.parent_appid) {
        console.log(`Found DLC parent app ${appData.data.parent_appid} for DLC ${dlcId}`);
        return appData.data.parent_appid.toString();
      }
    } else if (appData && !appData.success) {
      console.log(`Steam API returned success: false for DLC ${dlcId} - DLC may be delisted or not available`);
    }
  } catch (error) {
    console.error('Failed to get main game ID from Steam API:', error);
  }
  
  // No fallback mappings - rely entirely on Steam API like main game detection
  return null;
}

// Function to generate DLC lua content
export function generateDLCLuaContent(dlcId, manifestId, gameName) {
  const header = [
    `-- =========================================================`,
    `--  This file was fetched from SB manifest which is the exclusive property of SB server.`,
    `--  Redistribution of SB's files is not allowed AT ALL`,
    `--  Join the server here: https://discord.gg/7GaTSkCUyU`,
    `-- =========================================================`,
    `-- Generated Lua Manifest by SB manifest`,
    `-- DLC AppID ${dlcId}`,
    `-- Name: ${gameName}`,
    `-- Manifest ID: ${manifestId}`
  ];

  const commands = [
    `addappid(${dlcId})`,
    `addappid(${dlcId}, 1, "9f1556645ea8ef43529f920cf02a2682a6da5756b29e630ba376a0cde24e3908")`,
    `setManifestid(${dlcId}, "${manifestId}", 0)`
  ];

  return [...header, '', ...commands].join('\n');
}

export const cooldown = 30;
export const data = new SlashCommandBuilder()
  .setName('gendlc')
  .setDescription('Fetches DLC files for a given Steam AppID or DLC name.')
  .addStringOption(opt =>
    opt
      .setName('dlc')
      .setDescription('The Steam AppID (e.g., 2778580) or DLC name (e.g., ELDEN RING Shadow of the Erdtree)')
      .setRequired(true)
  );

export async function execute(interaction) {
  const startTime = Date.now();
  const dlcInput = interaction.options.getString('dlc');
  const guildId = interaction.guildId;
  const user = interaction.user;

  // Defer immediately to prevent interaction expiration
  try {
    await interaction.deferReply();
  } catch (err) {
    console.error('Failed to defer reply:', err);
    return;
  }

  // Execute the command without artificial timeout - let it complete naturally
  try {
    await executeCommand(interaction, startTime, dlcInput, guildId, user);
  } catch (error) {
    console.error('Command execution error:', error);
    try {
      await interaction.editReply({
        content: '❌ An error occurred while processing your request. Please try again.',
        embeds: [],
        components: []
      });
    } catch (err) {
      console.error('Failed to send error message:', err);
    }
  }
}

async function executeCommand(interaction, startTime, dlcInput, guildId, user) {
  // Simple rate limiting - prevent spam
  const userKey = `${user.id}_${guildId}`;
  const now = Date.now();
  if (userRateLimit.has(userKey)) {
    const lastRequest = userRateLimit.get(userKey);
    const timeDiff = now - lastRequest;
    if (timeDiff < 3000) { // 3 second cooldown
      try {
        await interaction.editReply({
          content: `⏳ Please wait ${Math.ceil((3000 - timeDiff) / 1000)} seconds before making another request.`,
          embeds: [],
          components: []
        });
      } catch (err) {
        console.error('Failed to send rate limit message:', err);
      }
      return;
    }
  }
  userRateLimit.set(userKey, now);

  try {
    const deferTime = Date.now();
    console.log(`[PERF] Defer time: ${deferTime - startTime}ms`);
    
    // 1) Usage limit check - OPTIMIZED for speed
    const usageStart = Date.now();
    let usage;
    try {
      usage = await Promise.race([
        checkAndUpdateUsage(user.id, guildId, interaction),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Usage check timeout')), 2000)
        )
      ]);
    } catch (usageError) {
      console.error('Usage check failed or timed out:', usageError);
      // Default to unlimited usage if check fails
      usage = { error: false, currentUsage: 0, limit: 999, isUnlimited: true };
    }
    console.log(`[PERF] Usage check: ${Date.now() - usageStart}ms`);
    
    if (usage.error) {
      const lang = await getLanguage(guildId);
      const isKey =
        getNested(locales.get(lang), usage.message) ||
        getNested(locales.get('en'), usage.message);
      const content = isKey
        ? await t(usage.message, guildId)
        : usage.message;

      try {
        return await interaction.editReply({ content });
      } catch (err) {
        console.error('Failed to edit reply with usage error:', err);
        return;
      }
    }

    // 2) Quick validation check
    if (!dlcInput || dlcInput.trim().length === 0) {
      try {
        await interaction.editReply({ 
          content: '❌ Please provide a DLC name or AppID.' 
        });
      } catch (err) {
        console.error('Failed to edit reply with validation error:', err);
      }
      return;
    }

    // 3) Determine if input is AppID or DLC name and get the actual AppID
    const appIdStart = Date.now();
    let dlcId;
    let dlcData;
    let notFound = false;
    let dbDlc = null;

    if (isAppId(dlcInput)) {
      // Input is an AppID
      dlcId = dlcInput;
      try {
        dlcData = await validateDLCAppId(dlcId);
      } catch (error) {
        // Try to get from DB
        try {
          const db = await getDb();
          dbDlc = await db.collection('dlcs').findOne({ appId: dlcId.toString() });
          if (dbDlc) {
            dlcData = dbDlc;
          } else {
            // Try to fetch the name from Steam API
            try {
              const axios = (await import('axios')).default;
              const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                params: { appids: dlcId, cc: 'us', l: 'en' },
                timeout: 15000
              });
              const appData = response.data[dlcId];
              if (appData && appData.success && appData.data && appData.data.name) {
                dlcData = { appid: dlcId, name: appData.data.name, header_image: appData.data.header_image };
              } else {
                dlcData = { appid: dlcId, name: 'Unknown DLC' };
              }
            } catch {
              dlcData = { appid: dlcId, name: 'Unknown DLC' };
            }
          }
        } catch (dbError) {
          console.error('Database error:', dbError);
          dlcData = { appid: dlcId, name: 'Unknown DLC' };
        }
      }
    } else {
      // Input is a DLC name, search in database
      try {
        dbDlc = await findDLCByName(dlcInput);
        if (dbDlc) {
          dlcId = dbDlc.appId;
          try {
            dlcData = await validateDLCAppId(dlcId);
          } catch (error) {
            dlcData = dbDlc;
          }
        } else {
          // Try to fetch the name from Steam API
          try {
            // Try to find AppID by searching Steam API (not implemented here, fallback to unknown)
            dlcData = { name: 'Unknown DLC' };
          } catch {
            dlcData = { name: 'Unknown DLC' };
          }
          notFound = true;
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        dlcData = { name: 'Unknown DLC' };
        notFound = true;
      }
    }
    console.log(`[PERF] DLC ID resolution: ${Date.now() - appIdStart}ms`);

         // 4) Show "validating" status
     try {
       const mainGameId = await getMainGameIdForDLC(dlcId);
       await interaction.editReply({
         embeds: [
           new EmbedBuilder()
             .setTitle(`${emojis.Upload} SB DLC MANIFEST`)
             .setDescription(
               `${emojis.Load} **Validating DLC:** ${dlcData.name || dlcId}\n\n` +
               `📋 **DLC AppID:** ${dlcId}\n` +
               `🎮 **Main Game:** ${mainGameId || 'Searching...'}\n` +
               `🔍 **Status:** Checking manifest files...`
             )
             .setColor(0xfea500)
             .setThumbnail(dlcData.header_image || null)
         ]
       });
     } catch (err) {
       console.error('Failed to edit reply with validation status:', err);
       return;
     }

    // 5) Check if it's actually a DLC (not a base game)
    // For DLC command, we'll be more lenient and allow any app that might be a DLC
    // The main check will be if we can find the DLC manifest in the repository
    let isDLC = false;
    
    // Check if Steam API indicates it's a DLC
    if (dlcData.isDLC || dlcData.parentAppId) {
      isDLC = true;
    }
    
    // If not clearly marked as DLC, we'll still try to process it
    // The real validation will happen when we try to find the DLC manifest

    // 6) Fetch files from repository
    const filesStart = Date.now();
    let files;
    let baseGameFiles;
    try {
      // First, try to fetch files from the DLC's own branch
      console.log(`Trying to fetch files from DLC branch: ${dlcId}`);
      try {
        baseGameFiles = await fetchFilesFromRepo(dlcId);
        
        // Look for DLC manifest in the DLC's own branch
        const dlcManifest = findDLCManifest(baseGameFiles, dlcId);
        
        if (dlcManifest) {
          console.log(`Found DLC manifest in DLC's own branch: ${dlcManifest.name}`);
          // Extract manifest ID from the filename
          const manifestId = extractManifestId(dlcManifest.name);
          if (!manifestId) {
            console.error(`Could not extract manifest ID from filename: ${dlcManifest.name}`);
            notFound = true;
          } else {
            // Create DLC lua content
            const dlcLuaContent = generateDLCLuaContent(dlcId, manifestId, dlcData.name);
            
            // Create files array with just the DLC files
            files = [
              {
                name: `${dlcId}.lua`,
                content: Buffer.from(dlcLuaContent, 'utf8')
              },
              dlcManifest // Include the manifest file
            ];
          }
        } else {
          // If not found in DLC's own branch, try main game's branch
          console.log(`DLC manifest not found in DLC's own branch, trying main game's branch`);
          const mainGameId = await getMainGameIdForDLC(dlcId);
          
          if (!mainGameId) {
            console.error(`Could not find main game for DLC ${dlcId} - this might not be a DLC or Steam API is unavailable`);
            notFound = true;
          } else {
            console.log(`Found main game ${mainGameId} for DLC ${dlcId}`);
            try {
              // Fetch files from the main game's branch
              baseGameFiles = await fetchFilesFromRepo(mainGameId);
              
              // Look for DLC manifest in the main game's files
              const dlcManifest = findDLCManifest(baseGameFiles, dlcId);
              
              if (!dlcManifest) {
                console.error(`DLC manifest not found for ${dlcId} in main game ${mainGameId}`);
                notFound = true;
              } else {
                // Extract manifest ID from the filename
                const manifestId = extractManifestId(dlcManifest.name);
                if (!manifestId) {
                  console.error(`Could not extract manifest ID from filename: ${dlcManifest.name}`);
                  notFound = true;
                } else {
                  // Create DLC lua content
                  const dlcLuaContent = generateDLCLuaContent(dlcId, manifestId, dlcData.name);
                  
                  // Create files array with just the DLC files
                  files = [
                    {
                      name: `${dlcId}.lua`,
                      content: Buffer.from(dlcLuaContent, 'utf8')
                    },
                    dlcManifest // Include the manifest file
                  ];
                }
              }
            } catch (err) {
              console.error(`Failed to fetch files from main game ${mainGameId}:`, err);
              notFound = true;
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch files from DLC branch ${dlcId}:`, err);
        // Fallback to main game's branch
        const mainGameId = await getMainGameIdForDLC(dlcId);
        
        if (!mainGameId) {
          console.error(`Could not find main game for DLC ${dlcId} - this might not be a DLC or Steam API is unavailable`);
          notFound = true;
        } else {
          console.log(`Found main game ${mainGameId} for DLC ${dlcId}`);
          try {
            // Fetch files from the main game's branch
            baseGameFiles = await fetchFilesFromRepo(mainGameId);
            
            // Look for DLC manifest in the main game's files
            const dlcManifest = findDLCManifest(baseGameFiles, dlcId);
            
            if (!dlcManifest) {
              console.error(`DLC manifest not found for ${dlcId} in main game ${mainGameId}`);
              notFound = true;
            } else {
              // Extract manifest ID from the filename
              const manifestId = extractManifestId(dlcManifest.name);
              if (!manifestId) {
                console.error(`Could not extract manifest ID from filename: ${dlcManifest.name}`);
                notFound = true;
              } else {
                // Create DLC lua content
                const dlcLuaContent = generateDLCLuaContent(dlcId, manifestId, dlcData.name);
                
                // Create files array with just the DLC files
                files = [
                  {
                    name: `${dlcId}.lua`,
                    content: Buffer.from(dlcLuaContent, 'utf8')
                  },
                  dlcManifest // Include the manifest file
                ];
              }
            }
          } catch (err) {
            console.error(`Failed to fetch files from main game ${mainGameId}:`, err);
            notFound = true;
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      notFound = true;
    }
    console.log(`[PERF] File fetching: ${Date.now() - filesStart}ms`);

    // 6.5) Auto-update check for main game (silent, in background)
    try {
      const mainGameId = await getMainGameIdForDLC(dlcId);
      if (mainGameId) {
        const db = await getDb();
        const gameRecord = await db.collection('games').findOne({ appId: mainGameId.toString() });
        
        if (gameRecord && gameRecord.manifestId) {
          // Check if main game manifest needs updating
          const updateCheck = await checkManifestNeedsUpdate(mainGameId, gameRecord.manifestId);
          
          if (updateCheck.needsUpdate) {
            console.log(`🔄 Auto-updating main game manifest for DLC ${dlcId}: ${updateCheck.currentManifestId} → ${updateCheck.latestManifestId}`);
            
            // Auto-update the main game manifest
            const updateResult = await autoUpdateManifest(mainGameId, gameRecord.manifestId);
            
            if (updateResult.updated) {
              console.log(`✅ Auto-updated main game ${mainGameId} manifest for DLC ${dlcId}`);
            }
          }
        }
      }
    } catch (updateError) {
      console.error(`Failed to auto-update main game manifest for DLC ${dlcId}:`, updateError);
      // Continue with DLC generation even if auto-update fails
    }

         if (notFound) {
       // DLC not found, show request button
       const mainGameId = await getMainGameIdForDLC(dlcId);
       const requestEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('DLC Not Found')
          .setDescription(
            `This DLC (${dlcInput}) isn't available yet.\n\n**What was tried:**\n• Checked DLC's own branch: ${dlcId}\n• Checked main game's branch: ${mainGameId || 'Unknown'}\n\n**Possible reasons:**\n• DLC manifest not found in either branch\n• DLC not yet added to our database\n• Steam API unavailable or DLC delisted\n• DLC may be delisted from Steam store\n\nYour request has been submitted to the staff — it will be added soon!`
          );

      const btn = new ButtonBuilder()
        .setCustomId(`request-dlc_${dlcInput}`)
        .setLabel('Request DLC')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❓');

      const row = new ActionRowBuilder().addComponents(btn);
      await interaction.editReply({ embeds: [requestEmbed], components: [row] });
      return;
    }

         // 7) Show "packing your beautiful DLC" status
     try {
       const mainGameId = await getMainGameIdForDLC(dlcId);
       await interaction.editReply({
         embeds: [
           new EmbedBuilder()
             .setTitle(
               `${emojis.Success} Validated DLC: ${dlcData.name}`
             )
             .setDescription(
               `🎮 **Packing your beautiful DLC!** 🎮\n\n` +
               `📦 **Processing:** ${files.length} files\n` +
               `🎯 **DLC ID:** ${dlcId}\n` +
               `🎮 **Main Game:** ${mainGameId || 'Unknown'}\n` +
               `⏳ **Status:** Creating package... 💖`
             )
             .setColor(0x00ff00)
             .setThumbnail(dlcData.header_image)
         ]
       });
     } catch (err) {
       console.error('Failed to edit reply with processing status:', err);
     }

    // 8) Zip into buffer and persist in DB IN PARALLEL
    const zipStart = Date.now();
    let zipBuffer;
    try {
      const [zipResult, dbResult] = await Promise.allSettled([
        createZipArchive(files),
        (async () => {
          const db = await getDb();
          return db.collection('dlcs').updateOne(
            { appId: dlcId.toString() },
            { $set: { name: dlcData.name, lastUpdated: new Date(), requester: user.id } },
            { upsert: true }
          );
        })()
      ]);
      
      if (zipResult.status === 'fulfilled') {
        zipBuffer = zipResult.value;
      } else {
        throw new Error('Failed to create zip archive');
      }
    } catch (err) {
      console.error('Failed to process files:', err);
      try {
        await interaction.editReply({
          content: '❌ Failed to process DLC files. Please try again.',
          embeds: [],
          components: []
        });
      } catch (replyErr) {
        console.error('Failed to send error message:', replyErr);
      }
      return;
    }
    console.log(`[PERF] Zip creation: ${Date.now() - zipStart}ms`);

         // 9) Show "zipping" status
     const mainGameId = await getMainGameIdForDLC(dlcId);
     await interaction.editReply({
       embeds: [
         new EmbedBuilder()
           .setTitle(
             `${emojis.Success} Found DLC Files: ${dlcData.name}`
           )
           .setDescription(
             `📦 **Creating your DLC package!** 📦\n\n` +
             `🎯 **Found:** ${files.length} files\n` +
             `🎮 **DLC ID:** ${dlcId}\n` +
             `🎮 **Main Game:** ${mainGameId || 'Unknown'}\n` +
             `🔧 **Status:** Zipping files...\n` +
             `✨ **Almost ready for you!** 💫`
           )
           .setColor(0x00ff00)
           .setThumbnail(dlcData.header_image)
       ]
     });

    // 10) Build success embed
    const embedStart = Date.now();
    const zipSizeMB = zipBuffer.length / (1024 * 1024);
    const DISCORD_LIMIT = 7.9;

    const buildSuccessEmbed = async () => {
      const embed = new EmbedBuilder()
        .setTitle(
          `${emojis.Success} DLC Generated Successfully: ${dlcData.name}`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setImage(dlcData.header_image)
        .setColor(0x57f287);

      // Get stored build version
      const buildVersion = getStoredBuildVersion(dlcId) || 'N/A';

             // Get main game ID for display
       const mainGameId = await getMainGameIdForDLC(dlcId);
       
       const fields = [
         { name: `${emojis.AppID} DLC AppID`, value: dlcId, inline: true },
         { name: `${emojis.File_Size} File Size`, value: `${zipSizeMB.toFixed(2)} MB`, inline: true },
         {
           name: `${emojis.Price} Price`,
           value: dlcData.is_free ? 'Free' : (dlcData.price_overview?.final_formatted || 'N/A'),
           inline: true
         },
         { name: `${emojis.Requester} Requested by`, value: user.toString(), inline: true },
         { name: `${emojis.Time} Total Time`, value: `${((Date.now() - interaction.createdTimestamp) / 1000).toFixed(1)}s`, inline: true },
         { name: '🛠️ Build Version', value: buildVersion, inline: true }
       ];
       
       // Add main game information
       if (mainGameId) {
         fields.push({ 
           name: '🎮 Main Game ID', 
           value: `${mainGameId} (Required to play this DLC)`, 
           inline: true 
         });
       }

      const storage = getStorageRequirement(dlcData.pc_requirements);
      if (storage) fields.push({ name: `${emojis.Storage} DLC Size`, value: storage, inline: true });

      fields.push({
        name: `${emojis.Usage} Daily Usage`,
        value: usage.isUnlimited ? `${usage.currentUsage} used today (Unlimited)` : `${usage.currentUsage}/${usage.limit}`,
        inline: true
      });

      const genres = dlcData.genres?.map(g => g.description).join(', ');
      if (genres) fields.push({ name: `${emojis.GENRES} Genres`, value: genres, inline: false });

      const desc = dlcData.short_description?.replace(/<[^>]*>/g, '');
      if (desc) fields.push({ name: `${emojis.DESCRIPTION} Description`, value: desc.slice(0, 1024), inline: false });

      embed.addFields(fields);
      embed.setFooter({ text: '💖 Made by SB chan 💖', iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png' });
      return embed;
    };

    // 11) Upload to Discord or external
    const uploadStart = Date.now();
    let downloadUrl = null;
    let successEmbed = await buildSuccessEmbed();
    let components = [];
    
         // Final preparation status
     try {
       const mainGameId = await getMainGameIdForDLC(dlcId);
       await interaction.editReply({
         embeds: [
           new EmbedBuilder()
             .setTitle(`${emojis.Success} DLC Generated Successfully: ${dlcData.name}`)
             .setDescription(
               `🎉 **Your DLC is ready!** 🎉\n\n` +
               `🚀 **Preparing files for download...**\n` +
               `🎮 **DLC ID:** ${dlcId}\n` +
               `🎮 **Main Game:** ${mainGameId || 'Unknown'}\n` +
               `💎 **Enjoy your beautiful DLC!** ✨`
             )
             .setColor(0x00ff00)
             .setThumbnail(dlcData.header_image)
         ]
       });
     } catch (err) {
       console.error('Failed to edit reply with success status:', err);
     }

    if (zipSizeMB < DISCORD_LIMIT) {
      const attachment = new AttachmentBuilder(zipBuffer, { name: `${dlcData.name}-${dlcId}.zip` });
             successEmbed.setDescription(
         `✅ **DLC files generated successfully!**\n\n📦 **Files included:**\n• ${dlcId}.lua (DLC configuration)\n• ${dlcId}_*.manifest (DLC manifest)\n\n💡 **Important:** This DLC requires the base game (ID: ${mainGameId || 'Unknown'}) to be installed and working.`
       );
      // Buttons: Patches, Request Update, Open in Steam, Owner Server
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`patches_${dlcId}`)
            .setLabel('Patches & Fixes')
            .setEmoji('🔧')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`request-update_${dlcId}`)
            .setLabel('Request Update')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setLabel('Open in Steam')
            .setEmoji('🛒')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://store.steampowered.com/app/${dlcId}`),
          new ButtonBuilder()
            .setLabel('Owner Server')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/7GaTSkCUyU')
        )
      ];
      try {
        await interaction.editReply({ embeds: [successEmbed], components, files: [attachment] });
      } catch (err) {
        console.error('Failed to send final reply with attachment:', err);
      }
    } else {
      // For large files, upload to external service
      try {
        downloadUrl = await uploadFile(zipBuffer, `${dlcData.name}-${dlcId}.zip`);
      } catch (uploadError) {
        console.error('Failed to upload file:', uploadError);
        try {
          await interaction.editReply({
            content: '❌ Failed to upload large file. Please try again.',
            embeds: [],
            components: []
          });
        } catch (err) {
          console.error('Failed to send upload error:', err);
        }
        return;
      }
      
             successEmbed = await buildSuccessEmbed();
       successEmbed.setDescription(`✅ **DLC files generated successfully!**\n\n📦 **Files included:**\n• ${dlcId}.lua (DLC configuration)\n• ${dlcId}_*.manifest (DLC manifest)\n\n💡 **Important:** This DLC requires the base game (ID: ${mainGameId || 'Unknown'}) to be installed and working.`);
      components = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Download')
            .setStyle(ButtonStyle.Link)
            .setURL(downloadUrl)
            .setEmoji(emojis.Download),
          new ButtonBuilder()
            .setCustomId(`patches_${dlcId}`)
            .setLabel('Patches & Fixes')
            .setEmoji('🔧')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`request-update_${dlcId}`)
            .setLabel('Request Update')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setLabel('Open in Steam')
            .setEmoji('🛒')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://store.steampowered.com/app/${dlcId}`),
          new ButtonBuilder()
            .setLabel('Owner Server')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Link)
            .setURL('https://discord.gg/7GaTSkCUyU')
        )
      ];
      try {
        await interaction.editReply({ embeds: [successEmbed], components });
      } catch (err) {
        console.error('Failed to send final reply with download link:', err);
      }
    }
    console.log(`[PERF] Upload process: ${Date.now() - uploadStart}ms`);
    console.log(`[PERF] Embed building: ${Date.now() - embedStart}ms`);
    console.log(`[PERF] TOTAL TIME: ${Date.now() - startTime}ms`);
    
    // Send usage info as follow-up
    try {
      const usageEmbed = new EmbedBuilder()
        .setDescription(`🔢 ${await t('FIELD_DAILY_USAGE', guildId)}: ${usage.currentUsage}/${usage.limit}`)
        .setColor(0x5865F2);
      
      if (zipSizeMB >= DISCORD_LIMIT && downloadUrl) {
        await interaction.followUp({ content: downloadUrl, embeds: [usageEmbed], flags: 64 });
      } else {
        await interaction.followUp({ embeds: [usageEmbed], flags: 64 });
      }
    } catch (err) {
      console.error('Failed to send usage info:', err);
    }

    // Button interaction collector for Patches & Fixes
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000 // 5 minutes
    });
    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === `patches_${dlcId}`) {
        if (btnInt.user.id !== user.id) {
          await btnInt.reply({ content: 'Only the requester can use this button.', flags: 64 });
          return;
        }
        const links = getPatchLinks(dlcData.name);
        await btnInt.reply({
          content: `🔧 **Patches & Fixes for ${dlcData.name}**\nFind patches and fixes for this DLC on the following sites:\n${links.join('\n')}\n\nRequested by ${user.toString()}`,
          flags: 64
        });
      }
      // You can add more button handlers here if needed
    });

  } catch (error) {
    console.error('Error in gendlc command:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred.', flags: 64 });
    } else {
      await interaction.reply({ content: 'An error occurred.', flags: 64 });
    }
  }
}

// Utility to generate patch/fix links for a DLC
function getPatchLinks(dlcName) {
  const encoded = encodeURIComponent(dlcName);
  return [
    `🔗 [CS.RIN.RU](https://cs.rin.ru/forum/search.php?keywords=${encoded})`,
    `🔗 [Online-Fix.me](https://online-fix.me/index.php?do=search&subaction=search&story=${encoded})`,
    `🔗 [Dodi repacks](https://dodi-repacks.site/?s=${encoded})`,
    `🔗 [FitGirl repacks](https://fitgirl-repacks.site/?s=${encoded})`
  ];
} 