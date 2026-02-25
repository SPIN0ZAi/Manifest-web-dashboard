// src/commands/gen.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { validateAppId, checkGameReleaseStatus, searchGamesByName } from '../utils/steam.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { createZipArchive } from '../utils/zip.js';
import { uploadFile } from '../utils/uploader.js';
import { t, getNested, locales, getLanguage } from '../utils/localization.js';
import { getDb } from '../utils/database.js';
import { checkAndUpdateUsage } from '../utils/usageTracker.js';
import { emojis } from '../utils/emojis.js';
import { getStoredBuildVersion } from '../utils/manifestProcessor.js';
import { isGameFiltered, getBaseGameIfDLC, fetchSteamStoreInfo, fetchPeakCCU, fuzzyFindGames } from '../utils/gen.js';
import { analyzeDLCStatus, checkManifestUpdate, updateManifest } from '../utils/dlcAnalyzer.js';
import { recordDownload, isFavorite } from '../utils/downloadTracker.js';
import { retryWithBackoff, getErrorMessage, axiosWithRetry } from '../utils/network.js';
import { autoUpdateOnRequest } from '../utils/manifestUpdater.js';
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

// Function to search for game by name in database with fuzzy matching
async function findGameByName(gameName) {
  const db = await getDb();
  
  // First try exact name match
  let game = await db.collection('games').findOne(
    { name: { $regex: new RegExp(`^${gameName}$`, 'i') } },
    { sort: { lastUpdated: -1 } }
  );
  
  if (game) {
    if (game.appId) {
      game.appId = game.appId.toString();
    }
    return game;
  }
  
  // Then try partial name match
  game = await db.collection('games').findOne(
    { name: { $regex: new RegExp(gameName, 'i') } },
    { sort: { lastUpdated: -1 } }
  );
  
  if (game && game.appId) {
    game.appId = game.appId.toString();
  }
  return game;
}

// Autocomplete handler for game suggestions
export async function autocomplete(interaction) {
  try {
    // Check if interaction is still valid (not expired)
    if (!interaction.responded && !interaction.deferred) {
      const focusedValue = interaction.options.getFocused();
      
      if (!focusedValue || focusedValue.length < 2) {
        await interaction.respond([]);
        return;
      }
      
      // If it's a number, suggest it as AppID
      if (/^\d+$/.test(focusedValue)) {
        await interaction.respond([
          { name: `AppID: ${focusedValue}`, value: focusedValue }
        ]);
        return;
      }
      
      // Add timeout to prevent long-running autocomplete
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Autocomplete timeout')), 2500)
      );
      
      try {
        // Search for games by name using fuzzy matching with timeout
        const suggestions = await Promise.race([
          fuzzyFindGames(focusedValue, 15), // Reduced from 25 to 15 for speed
          timeoutPromise
        ]);
        
        const choices = suggestions.map(game => ({
          name: `${game.name} (ID: ${game.appId})`.slice(0, 100), // Discord limit
          value: game.appId.toString()
        }));
        
        // Final check before responding
        if (!interaction.responded) {
          await interaction.respond(choices);
        }
      } catch (timeoutError) {
        // If fuzzy search times out, provide simple AppID suggestion
        if (!interaction.responded) {
          await interaction.respond([
            { name: `Search: "${focusedValue}" (try exact AppID for faster results)`, value: focusedValue }
          ]);
        }
      }
    }
  } catch (error) {
    // Silently handle interaction errors to prevent spam
    if (error.code !== 10062) { // Only log non-timeout errors
      console.error('Autocomplete error:', error);
    }
  }
}

// Function to determine if input is an AppID (numeric) or game name
function isAppId(input) {
  return /^\d+$/.test(input.trim());
}

export const cooldown = 30;
export const data = new SlashCommandBuilder()
  .setName('gen')
  .setDescription('Fetches game files for a given Steam AppID or game name.')
  .addStringOption(opt =>
    opt
      .setName('game')
      .setDescription('The Steam AppID (e.g., 730) or game name (e.g., Counter-Strike 2)')
      .setRequired(true)
      .setAutocomplete(true)
  );

// Utility to generate patch/fix links for a game
function getPatchLinks(gameName) {
  const encoded = encodeURIComponent(gameName);
  return [
    `🔗 [CS.RIN.RU](https://cs.rin.ru/forum/search.php?keywords=${encoded})`,
    `🔗 [Online-Fix.me](https://online-fix.me/index.php?do=search&subaction=search&story=${encoded})`,
    `🔗 [Dodi repacks](https://dodi-repacks.site/?s=${encoded})`,
    `🔗 [FitGirl repacks](https://fitgirl-repacks.site/?s=${encoded})`
  ];
}

export async function execute(interaction) {
  const startTime = Date.now();
  const gameInput = interaction.options.getString('game');
  const guildId = interaction.guildId;
  const user = interaction.user;

  // Defer immediately to prevent interaction expiration
  try {
    await interaction.deferReply();
  } catch (err) {
    console.error('Failed to defer reply:', err);
    // If interaction is already expired, we can't respond
    if (err.code === 10062) {
      console.log('Interaction expired, cannot respond');
      return;
    }
    return;
  }

  // Execute the command without artificial timeout - let it complete naturally
  try {
    await executeCommand(interaction, startTime, gameInput, guildId, user);
  } catch (error) {
    console.error('Command execution error:', error);
    
    // Get user-friendly error message
    const errorMsg = getErrorMessage(error, 'game file generation');
    
    try {
      await interaction.editReply({
        content: `${errorMsg}\n\n*If this problem persists, please contact support.*`,
        embeds: [],
        components: []
      });
    } catch (err) {
      console.error('Failed to send error message:', err);
      // Try to send a simple followup if edit fails
      try {
        await interaction.followUp({
          content: '❌ A technical error occurred. Please try again or contact support if the issue persists.',
          ephemeral: true
        });
      } catch (followupErr) {
        console.error('Failed to send followup error message:', followupErr);
      }
    }
  }
}

async function executeCommand(interaction, startTime, gameInput, guildId, user) {
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
    if (!gameInput || gameInput.trim().length === 0) {
      try {
        await interaction.editReply({ 
          content: '❌ Please provide a game name or AppID.' 
        });
      } catch (err) {
        console.error('Failed to edit reply with validation error:', err);
      }
      return;
    }

    // 3) Determine if input is AppID or game name and get the actual AppID
    const appIdStart = Date.now();
    let appId;
    let gameData;
    let notFound = false;
    let dbGame = null;

    if (isAppId(gameInput)) {
      // Input is an AppID
      appId = gameInput;
      try {
        gameData = await validateAppId(appId);
      } catch (error) {
        // validateAppId failed, check if game exists in our database first
        try {
          const db = await getDb();
          dbGame = await db.collection('games').findOne({ appId: appId.toString() });
          if (dbGame) {
            gameData = dbGame;
          } else {
            // Game not in database, check if it's an unreleased game on Steam
            console.log(`AppID ${appId} not found in database, checking Steam for release status...`);
            
            try {
              const releaseInfo = await checkGameReleaseStatus(appId);
              
              if (releaseInfo.exists && !releaseInfo.isReleased && releaseInfo.comingSoon) {
                // Game exists but is not released yet
                const unreleasedEmbed = new EmbedBuilder()
                  .setColor(0x9b59b6)
                  .setTitle('🕒 Game Not Released Yet!')
                  .setDescription(`**${releaseInfo.name}** hasn't been released yet, but don't worry!`)
                  .setThumbnail(releaseInfo.headerImage || 'https://via.placeholder.com/300x140?text=Coming+Soon')
                  .addFields([
                    {
                      name: '📅 Release Date',
                      value: releaseInfo.releaseDate.raw || 'To be announced',
                      inline: true
                    },
                    {
                      name: '🎮 AppID',
                      value: `\`${releaseInfo.appId}\``,
                      inline: true
                    },
                    {
                      name: '💰 Price',
                      value: releaseInfo.isFree ? 'Free to Play' : (releaseInfo.price?.final_formatted || 'TBA'),
                      inline: true
                    }
                  ])
                  .setFooter({ 
                    text: '🔔 I\'ll ping you when this game is added to our database!',
                    iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
                  })
                  .setTimestamp();

                if (releaseInfo.shortDescription) {
                  unreleasedEmbed.addFields([{
                    name: '📝 Description',
                    value: releaseInfo.shortDescription.slice(0, 1024),
                    inline: false
                  }]);
                }

                const wishlistBtn = new ButtonBuilder()
                  .setLabel('Wishlist on Steam')
                  .setStyle(ButtonStyle.Link)
                  .setURL(`https://store.steampowered.com/app/${releaseInfo.appId}`)
                  .setEmoji('⭐');

                const notifyBtn = new ButtonBuilder()
                  .setCustomId(`notify-release_${releaseInfo.appId}`)
                  .setLabel('Notify Me When Released')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔔');

                const row = new ActionRowBuilder().addComponents(wishlistBtn, notifyBtn);
                await interaction.editReply({ embeds: [unreleasedEmbed], components: [row] });
                return;
              } else if (releaseInfo.exists) {
                // Game exists and is released, but validateAppId failed for other reasons
                gameData = {
                  appid: appId,
                  name: releaseInfo.name,
                  header_image: releaseInfo.headerImage,
                  short_description: releaseInfo.shortDescription
                };
              } else {
                // Game doesn't exist on Steam at all
                gameData = { appid: appId, name: 'Unknown Game' };
              }
            } catch (releaseCheckError) {
              console.error('Error checking release status for AppID:', releaseCheckError);
              // Fallback to checking Steam API directly
              try {
                const axios = (await import('axios')).default;
                const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
                  params: { appids: appId, cc: 'us', l: 'en' },
                  timeout: 15000
                });
                const appData = response.data[appId];
                if (appData && appData.success && appData.data && appData.data.name) {
                  gameData = { appid: appId, name: appData.data.name };
                } else {
                  gameData = { appid: appId, name: 'Unknown Game' };
                }
              } catch {
                gameData = { appid: appId, name: 'Unknown Game' };
              }
            }
          }
        } catch (dbError) {
          console.error('Database error:', dbError);
          gameData = { appid: appId, name: 'Unknown Game' };
        }
      }
    } else {
      // Input is a game name, search in database
      try {
        dbGame = await findGameByName(gameInput);
        if (dbGame) {
          appId = dbGame.appId;
          try {
            gameData = await validateAppId(appId);
          } catch (error) {
            gameData = dbGame;
          }
        } else {
          // Game not found in database, check Steam for existence and release status
          console.log(`Game "${gameInput}" not found in database, checking Steam...`);
          
          // First try to search Steam by name to get potential AppIDs
          const steamSearchResults = await searchGamesByName(gameInput);
          
          if (steamSearchResults.length > 0) {
            // Check the first result for release status
            const topResult = steamSearchResults[0];
            try {
              const releaseInfo = await checkGameReleaseStatus(topResult.appId);
              
              if (releaseInfo.exists && !releaseInfo.isReleased && releaseInfo.comingSoon) {
                // Game exists but is not released yet
                const unreleasedEmbed = new EmbedBuilder()
                  .setColor(0x9b59b6)
                  .setTitle('🕒 Game Not Released Yet!')
                  .setDescription(`**${releaseInfo.name}** hasn't been released yet, but don't worry!`)
                  .setThumbnail(releaseInfo.headerImage || 'https://via.placeholder.com/300x140?text=Coming+Soon')
                  .addFields([
                    {
                      name: '📅 Release Date',
                      value: releaseInfo.releaseDate.raw || 'To be announced',
                      inline: true
                    },
                    {
                      name: '🎮 AppID',
                      value: `\`${releaseInfo.appId}\``,
                      inline: true
                    },
                    {
                      name: '💰 Price',
                      value: releaseInfo.isFree ? 'Free to Play' : (releaseInfo.price?.final_formatted || 'TBA'),
                      inline: true
                    }
                  ])
                  .setFooter({ 
                    text: '🔔 I\'ll ping you when this game is added to our database!',
                    iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
                  })
                  .setTimestamp();

                if (releaseInfo.shortDescription) {
                  unreleasedEmbed.addFields([{
                    name: '📝 Description',
                    value: releaseInfo.shortDescription.slice(0, 1024),
                    inline: false
                  }]);
                }

                const wishlistBtn = new ButtonBuilder()
                  .setLabel('Wishlist on Steam')
                  .setStyle(ButtonStyle.Link)
                  .setURL(`https://store.steampowered.com/app/${releaseInfo.appId}`)
                  .setEmoji('⭐');

                const notifyBtn = new ButtonBuilder()
                  .setCustomId(`notify-release_${releaseInfo.appId}`)
                  .setLabel('Notify Me When Released')
                  .setStyle(ButtonStyle.Primary)
                  .setEmoji('🔔');

                const row = new ActionRowBuilder().addComponents(wishlistBtn, notifyBtn);
                await interaction.editReply({ embeds: [unreleasedEmbed], components: [row] });
                return;
              }
            } catch (releaseCheckError) {
              console.error('Error checking release status:', releaseCheckError);
            }
          }
          
          // If not an unreleased game, try to provide suggestions from our database
          const suggestions = await fuzzyFindGames(gameInput, 5);
          if (suggestions.length > 0) {
            const suggestionEmbed = new EmbedBuilder()
              .setColor(0xffa500)
              .setTitle('🔍 Game Not Found - Did you mean?')
              .setDescription(`Could not find "${gameInput}" in our database. Here are some similar games:`)
              .addFields(
                suggestions.map((game, index) => ({
                  name: `${index + 1}. ${game.name}`,
                  value: `AppID: \`${game.appId}\`\nUse: \`/gen game:${game.appId}\``,
                  inline: false
                }))
              )
              .setFooter({ text: 'Use the AppID or exact game name in your next command' });

            const requestBtn = new ButtonBuilder()
              .setCustomId(`request-game_${gameInput}`)
              .setLabel('Request New Game')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❓');

            const row = new ActionRowBuilder().addComponents(requestBtn);
            await interaction.editReply({ embeds: [suggestionEmbed], components: [row] });
            return;
          } else {
            // No suggestions found, fallback to unknown
            try {
              gameData = { name: 'Unknown Game' };
            } catch {
              gameData = { name: 'Unknown Game' };
            }
            notFound = true;
          }
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        gameData = { name: 'Unknown Game' };
        notFound = true;
      }
    }
    console.log(`[PERF] AppID resolution: ${Date.now() - appIdStart}ms`);

    // 4) Show "validating" status - OPTIMIZED to be faster
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${emojis.Upload} SB MANIFEST`)
            .setDescription(
              `${emojis.Load} ${await t('VALIDATING_APPID', guildId, { appId: appId || gameInput })}`
            )
            .setColor(0xfea500)
        ]
      });
    } catch (err) {
      console.error('Failed to edit reply with validation status:', err);
      if (err.code === 10062) {
        console.log('Interaction expired during validation status update');
        return;
      }
      return;
    }

    // Check whitelist BEFORE AI filtering
    const whitelistStart = Date.now();
    if (whitelist.includes(appId)) {
      interaction._genLogInfo = {
        gameName: gameData?.name || 'Unknown',
        badTagCount: 0,
        badTags: [],
        filterStatus: 'WHITELISTED'
      };
      console.log(`[PERF] Whitelist check (SKIPPED AI): ${Date.now() - whitelistStart}ms`);
      // Skip all Steam API calls and AI filtering for whitelisted games
      // Go directly to file generation
    } else {
      // --- Fetch Steam info and CCU for filtering (IN PARALLEL) ---
      let steamInfo = null;
      let peakCCU = null;
      
      // Run Steam API calls in parallel for faster response
      const steamStart = Date.now();
      try {
        const [steamInfoResult, peakCCUResult] = await Promise.allSettled([
          fetchSteamStoreInfo(appId),
          fetchPeakCCU(appId)
        ]);
        
        if (steamInfoResult.status === 'fulfilled') {
          steamInfo = steamInfoResult.value;
        }
        if (peakCCUResult.status === 'fulfilled') {
          peakCCU = peakCCUResult.value;
        }
      } catch (e) {
        console.error('Failed to fetch Steam info:', e);
      }
      console.log(`[PERF] Steam API calls: ${Date.now() - steamStart}ms`);
      
      if (steamInfo) {
        gameData = { ...gameData, ...steamInfo, peak_ccu: peakCCU };
      } else {
        gameData = { ...gameData, peak_ccu: peakCCU };
      }

      // If we couldn't fetch Steam info, but gameData is from DB, show a warning but allow download
      if (!steamInfo && dbGame) {
        try {
          await interaction.followUp({
            content: '⚠️ Failed to fetch game info from Steam. Providing available files from the database.',
            flags: 64
          });
        } catch (err) {
          console.error('Failed to send Steam info warning:', err);
        }
      }

      // --- NSFW/Low-Quality Filtering & DLC Handling ---
      // 4.1) Check for NSFW/filtered tags
      const aiStart = Date.now();
      let filterResult;
      try {
        filterResult = await isGameFiltered(gameData);
      } catch (filterError) {
        console.error('AI filter error:', filterError);
        // Default to not filtered if AI check fails
        filterResult = { filtered: false, whitelisted: false, reason: 'AI check failed' };
      }
      console.log(`[PERF] AI filtering: ${Date.now() - aiStart}ms`);
      console.log(`[PERF] Whitelist check (with AI): ${Date.now() - whitelistStart}ms`);
      
      // Gather info for logging
      let badTagCount = 0;
      let badTags = [];
      if (filterResult.filtered) {
        // Extract bad tags from the filter reason if present, or fallback
        const match = filterResult.reason.match(/\[(.*)\]/);
        if (match && match[1]) {
          badTags = match[1].split(',').map(s => s.trim());
          badTagCount = badTags.length;
        }
        interaction._genLogInfo = {
          gameName: gameData?.name || 'Unknown',
          badTagCount,
          badTags,
          filterStatus: 'FILTERED'
        };
        try {
          // Create a professional, friendly blocked content message
          const blockedEmbed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🔞 Content Not Available')
            .setDescription(`We're unable to provide **${gameData?.name || 'this content'}** through our service.`)
            .addFields([
              {
                name: '🛡️ Content Policy',
                value: 'Our service focuses on family-friendly and mainstream gaming content.',
                inline: false
              },
              {
                name: '🎮 Try Instead',
                value: '• Popular AAA games\n• Indie favorites\n• Classic titles\n• Educational games',
                inline: true
              },
              {
                name: '🌟 Suggestions',
                value: '• Use `/gen` with other games\n• Browse Steam\'s top games\n• Check our popular titles',
                inline: true
              }
            ])
            .setFooter({ 
              text: '💖 Thanks for understanding our content guidelines!',
              iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

          // Add Steam link if we have the AppID
          const components = [];
          if (appId && /^\d+$/.test(appId)) {
            const steamBtn = new ButtonBuilder()
              .setLabel('View on Steam Store')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://store.steampowered.com/app/${appId}`)
              .setEmoji('🛒');

            const helpBtn = new ButtonBuilder()
              .setCustomId('content-help')
              .setLabel('Content Guidelines')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📋');

            const row = new ActionRowBuilder().addComponents(steamBtn, helpBtn);
            components.push(row);
          }

          await interaction.editReply({
            embeds: [blockedEmbed],
            components: components
          });
        } catch (err) {
          console.error('Failed to edit reply with filter result:', err);
        }
        return;
      } else if (gameData && Array.isArray(gameData.tags)) {
        // If not filtered, still count bad tags for logging
        const ADULT_TAGS = [
          "Sexual Content", "Hentai", "Nudity", "Mature", "NSFW", "Adult Only", "Ecchi", "Lewd", "Erotic", "18+", "Boobs", "Yaoi", "Yuri", "Fetish", "Sex", "Tentacles"
        ];
        const gameTags = gameData.tags.map(t => t.trim().toLowerCase());
        for (const tag of gameTags) {
          for (const adult of ADULT_TAGS) {
            if (tag.includes(adult.toLowerCase())) {
              badTags.push(tag);
              break;
            }
          }
        }
        badTags = Array.from(new Set(badTags));
        badTagCount = badTags.length;
      }
      interaction._genLogInfo = {
        gameName: gameData?.name || 'Unknown',
        badTagCount,
        badTags,
        filterStatus: filterResult.filtered ? 'FILTERED' : 'PASSED'
      };
      if (filterResult.whitelisted) {
        try {
          await interaction.followUp({
            content: `This game contains mature content, but it's a mainstream title — generating the files now...`,
            flags: 64
          });
        } catch (err) {
          console.error('Failed to send whitelist message:', err);
        }
      }

      // Add to whitelist if it passed the AI check
      if (!whitelist.includes(appId) && !filterResult.filtered) {
        whitelist.push(appId);
        try {
          fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2));
        } catch (writeError) {
          console.error('Failed to write to whitelist:', writeError);
        }
      }
    }

    // 4.2) DLC Handling
    const baseAppId = getBaseGameIfDLC(gameData);
    if (baseAppId) {
      // Try to fetch the base game data
      let baseGameData;
      try {
        baseGameData = await validateAppId(baseAppId);
      } catch (e) {
        try {
          await interaction.editReply({
            content: `I can't generate files for DLCs on their own, and couldn't find the base game. Please contact staff.`,
            embeds: [],
            components: []
          });
        } catch (err) {
          console.error('Failed to edit reply with DLC error:', err);
        }
        return;
      }
      try {
        await interaction.editReply({
          content: `I can't generate files for DLCs on their own. Instead, please download the full game — it includes the DLC content when available.`,
          embeds: [],
          components: []
        });
      } catch (err) {
        console.error('Failed to edit reply with DLC message:', err);
        return;
      }
      // Overwrite appId and gameData to use the base game
      appId = baseAppId;
      gameData = baseGameData;
    }

    if (notFound) {
      // Game not found in DB, show request button
      const requestEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('Game Not Found')
        .setDescription(
          `This game (${gameInput}) isn't in our database yet.\nYour request has been submitted to the staff — it will be added soon!`
        );

      const btn = new ButtonBuilder()
        .setCustomId(`request-game_${gameInput}`)
        .setLabel('Request Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❓');

      const row = new ActionRowBuilder().addComponents(btn);
      await interaction.editReply({ embeds: [requestEmbed], components: [row] });
      return;
    }

    // 5) Fetch files (skip manifest updates for now to prevent timeouts)
    const filesStart = Date.now();
    let files;
    let updateInfo = null; // Will be set later in background
    
    try {
      const [statsResult, filesResult] = await Promise.allSettled([
        updateStats(appId),
        fetchFilesFromRepo(appId)
      ]);
      
      if (filesResult.status === 'fulfilled') {
        files = filesResult.value;
      } else {
        // Files not found, check if it's an unreleased game before showing "not found"
        console.log(`Files not found for AppID ${appId}, checking if it's an unreleased game...`);
        try {
          const releaseInfo = await checkGameReleaseStatus(appId);
          
          if (releaseInfo.exists && !releaseInfo.isReleased && releaseInfo.comingSoon) {
            // Game exists but is not released yet
            const unreleasedEmbed = new EmbedBuilder()
              .setColor(0x9b59b6)
              .setTitle('🕒 Game Not Released Yet!')
              .setDescription(`**${releaseInfo.name}** hasn't been released yet, but don't worry!`)
              .setThumbnail(releaseInfo.headerImage || 'https://via.placeholder.com/300x140?text=Coming+Soon')
              .addFields([
                {
                  name: '📅 Release Date',
                  value: releaseInfo.releaseDate.raw || 'To be announced',
                  inline: true
                },
                {
                  name: '🎮 AppID',
                  value: `\`${releaseInfo.appId}\``,
                  inline: true
                },
                {
                  name: '💰 Price',
                  value: releaseInfo.isFree ? 'Free to Play' : (releaseInfo.price?.final_formatted || 'TBA'),
                  inline: true
                }
              ])
              .setFooter({ 
                text: '🔔 I\'ll ping you when this game is added to our database!',
                iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png'
              })
              .setTimestamp();

            if (releaseInfo.shortDescription) {
              unreleasedEmbed.addFields([{
                name: '📝 Description',
                value: releaseInfo.shortDescription.slice(0, 1024),
                inline: false
              }]);
            }

            const wishlistBtn = new ButtonBuilder()
              .setLabel('Wishlist on Steam')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://store.steampowered.com/app/${releaseInfo.appId}`)
              .setEmoji('⭐');

            const notifyBtn = new ButtonBuilder()
              .setCustomId(`notify-release_${releaseInfo.appId}`)
              .setLabel('Notify Me When Released')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🔔');

            const row = new ActionRowBuilder().addComponents(wishlistBtn, notifyBtn);
            await interaction.editReply({ embeds: [unreleasedEmbed], components: [row] });
            return;
          }
        } catch (releaseCheckError) {
          console.error('Error checking release status during file fetch:', releaseCheckError);
        }
        
        // If not unreleased, mark as not found
        notFound = true;
      }
    } catch (err) {
      console.error('Error during file fetching:', err);
      notFound = true;
    }
    console.log(`[PERF] File fetching: ${Date.now() - filesStart}ms`);

    if (notFound) {
      // Game not found in DB, show request button
      const requestEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('Game Not Found')
        .setDescription(
          `This game (${gameInput}) isn't in our database yet.\nYour request has been submitted to the staff — it will be added soon!`
        );

      const btn = new ButtonBuilder()
        .setCustomId(`request-game_${gameInput}`)
        .setLabel('Request Game')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❓');

      const row = new ActionRowBuilder().addComponents(btn);
      await interaction.editReply({ embeds: [requestEmbed], components: [row] });
      return;
    }

    // 5.5) Manifest update check and DLC analysis (with timeout)
    let manifestUpdateInfo = null;
    let dlcAnalysis = null;
    
    try {
      // Set a timeout for the entire analysis process
      const analysisPromise = (async () => {
        // Check if main manifest needs updating
        const db = await getDb();
        const gameRecord = await db.collection('games').findOne({ appId: appId.toString() });
        
        if (gameRecord && gameRecord.manifestId) {
          console.log(`🔍 Checking manifest updates for ${appId}...`);
          manifestUpdateInfo = await checkManifestUpdate(appId, gameRecord.manifestId);
          
          if (manifestUpdateInfo.needsUpdate) {
            console.log(`🔄 Manifest update available: ${manifestUpdateInfo.currentManifestId} → ${manifestUpdateInfo.latestManifestId}`);
          } else {
            console.log(`✅ Manifest is up to date for ${appId}`);
          }
        } else {
          console.log(`ℹ️ No manifest ID found in database for ${appId}`);
        }
        
        // Only analyze DLC if manifest check was successful
        if (!manifestUpdateInfo || !manifestUpdateInfo.needsUpdate) {
          console.log(`🔍 Analyzing DLC status for ${appId}...`);
          dlcAnalysis = await analyzeDLCStatus(appId);
          console.log(`✅ DLC analysis complete for ${appId}`);
        }
      })();
      
      // Wait for analysis with a 15-second timeout
      await Promise.race([
        analysisPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), 15000)
        )
      ]);
      
    } catch (analysisError) {
      console.error(`Failed to analyze game ${appId}:`, analysisError.message);
      // Continue with generation even if analysis fails
    }

    // 6) Show "packing your beautiful game" status
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              `${emojis.Success} ${await t('VALIDATED_GAME', guildId, { gameName: gameData.name })}`
            )
            .setDescription(`🎮 **Packing your beautiful game!** 🎮\n\n📦 Processing ${files.length} files...\n⏳ Please be patient, this may take a moment! 💖`)
            .setColor(0x00ff00)
            .setThumbnail(gameData.header_image)
        ]
      });
    } catch (err) {
      console.error('Failed to edit reply with processing status:', err);
      if (err.code === 10062) {
        console.log('Interaction expired during processing status update');
        return;
      }
    }

    // 7) Zip into buffer and persist in DB IN PARALLEL
    const zipStart = Date.now();
    let zipBuffer;
    try {
      const [zipResult, dbResult] = await Promise.allSettled([
        createZipArchive(files),
        (async () => {
          const db = await getDb();
          return db.collection('games').updateOne(
            { appId: appId.toString() },
            { $set: { name: gameData.name, lastUpdated: new Date(), requester: user.id } },
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
          content: '❌ Failed to process game files. Please try again.',
          embeds: [],
          components: []
        });
      } catch (replyErr) {
        console.error('Failed to send error message:', replyErr);
      }
      return;
    }
    console.log(`[PERF] Zip creation: ${Date.now() - zipStart}ms`);

    // 8) Show "zipping" status
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            `${emojis.Success} ${await t('FOUND_FILES', guildId, { count: files.length, gameName: gameData.name })}`
          )
          .setDescription(`📦 **Creating your game package!** 📦\n\n🎯 Found ${files.length} files\n🔧 ${await t('ZIPPING_FILES', guildId)}\n✨ Almost ready for you! 💫`)
          .setColor(0x00ff00)
          .setThumbnail(gameData.header_image)
      ]
    });

    // 9) Build success embed
    const embedStart = Date.now();
    const zipSizeMB = zipBuffer.length / (1024 * 1024);
    const DISCORD_LIMIT = 7.9;

    const buildSuccessEmbed = async () => {
      const embed = new EmbedBuilder()
        .setTitle(
          `${emojis.Success} ${await t('SUCCESS_DESCRIPTION', guildId, { gameName: gameData.name })}`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setImage(gameData.header_image)
        .setColor(0x57f287);

      // Get stored build version
      const buildVersion = getStoredBuildVersion(appId) || 'N/A';

      const fields = [
        { name: `${emojis.AppID} AppID`, value: appId, inline: true },
        { name: `${emojis.File_Size} File Size`, value: `${zipSizeMB.toFixed(2)} MB`, inline: true },
        {
          name: `${emojis.Price} Price`,
          value: gameData.is_free ? 'Free' : (gameData.price_overview?.final_formatted || 'N/A'),
          inline: true
        },
        { name: `${emojis.Requester} Requested by`, value: user.toString(), inline: true },
        { name: `${emojis.Time} Total Time`, value: `${((Date.now() - interaction.createdTimestamp) / 1000).toFixed(1)}s`, inline: true },
        { name: '🛠️ Build Version', value: buildVersion, inline: true }
      ];

      // Add manifest update status (placeholder - will be updated in background)
      if (updateInfo) {
        if (updateInfo.updated && updateInfo.hasUpdate) {
          const updateCount = Object.keys(updateInfo.depotUpdates || {}).length;
          fields.push({ 
            name: '🆕 Manifest Update', 
            value: `✅ Updated to latest manifest (${updateCount} depots)`, 
            inline: true 
          });
        } else if (!updateInfo.updated && !updateInfo.hasUpdate && updateInfo.current) {
          fields.push({ 
            name: '🔄 Manifest Status', 
            value: '✅ Up to Date', 
            inline: true 
          });
        } else if (updateInfo.error) {
          fields.push({ 
            name: '🔄 Manifest Status', 
            value: '⚠️ Check Failed', 
            inline: true 
          });
        }
      } else {
        fields.push({ 
          name: '🔄 Manifest Status', 
          value: 'ℹ️ Not Checked', 
          inline: true 
        });
      }

      // Add DLC status
      if (dlcAnalysis) {
        if (dlcAnalysis.totalDLC > 0) {
          const excludedCount = dlcAnalysis.totalDLC - dlcAnalysis.validDLC;
          const excludedText = excludedCount > 0 ? ` (${excludedCount} excluded)` : '';
          const dlcStatus = `📊 ${dlcAnalysis.totalDLC} DLCs${excludedText}\n✅ ${dlcAnalysis.existingValidDLC}/${dlcAnalysis.validDLC} valid • 📈 ${dlcAnalysis.completion}%`;
          fields.push({ 
            name: '🎮 DLC Status', 
            value: dlcStatus, 
            inline: true 
          });
        } else {
          // Show that no DLCs were found
          const dlcStatus = dlcAnalysis.error ? 
            `❌ Analysis Failed\n${dlcAnalysis.error}` : 
            `✅ No DLCs Found\nThis game has no DLC content`;
          fields.push({ 
            name: '🎮 DLC Status', 
            value: dlcStatus, 
            inline: true 
          });
        }
      }

      const storage = getStorageRequirement(gameData.pc_requirements);
      if (storage) fields.push({ name: `${emojis.Storage} Game Size`, value: storage, inline: true });

      fields.push({
        name: `${emojis.Usage} Daily Usage`,
        value: usage.isUnlimited ? `${usage.currentUsage} used today (Unlimited)` : `${usage.currentUsage}/${usage.limit}`,
        inline: true
      });

      const genres = gameData.genres?.map(g => g.description).join(', ');
      if (genres) fields.push({ name: `${emojis.GENRES} Genres`, value: genres, inline: false });

      const desc = gameData.short_description?.replace(/<[^>]*>/g, '');
      if (desc) fields.push({ name: `${emojis.DESCRIPTION} Description`, value: desc.slice(0, 1024), inline: false });

      embed.addFields(fields);
      embed.setFooter({ text: '💖 Made by SB chan 💖', iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png' });
      return embed;
    };

    // 10) Upload to Discord or external
    const uploadStart = Date.now();
    let downloadUrl = null;
    let successEmbed = await buildSuccessEmbed();
    let components = [];
    
    // Final preparation status
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('SUCCESS_DESCRIPTION', guildId, { gameName: gameData.name })}`)
            .setDescription(`🎉 **Your game is ready!** 🎉\n\n🚀 Preparing files for download...\n💎 Enjoy your beautiful game! ✨`)
            .setColor(0x00ff00)
            .setThumbnail(gameData.header_image)
        ]
      });
      
      // Record the download in user's history
      await recordDownload(interaction.user.id, appId, gameData.name, gameData);
    } catch (err) {
      console.error('Failed to edit reply with success status:', err);
    }

    if (zipSizeMB < DISCORD_LIMIT) {
      const attachment = new AttachmentBuilder(zipBuffer, { name: `${gameData.name}-${appId}.zip` });
      successEmbed.setDescription(
        await t('SUCCESS_ATTACHED_DESCRIPTION', guildId, { gameName: gameData.name })
      );
      // Buttons: Patches, Request Update, Open in Steam, Owner Server, Add to Favorites, ManifestHub (if update available)
      const isUserFavorite = await isFavorite(interaction.user.id, appId);
      const firstRow = [
        new ButtonBuilder()
          .setCustomId(`patches_${appId}`)
          .setLabel('Patches & Fixes')
          .setEmoji('🔧')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`request-update_${appId}`)
          .setLabel('Request Update')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`favorite_${appId}`)
          .setLabel(isUserFavorite ? 'Remove Favorite' : 'Add to Favorites')
          .setEmoji(isUserFavorite ? '💔' : '❤️')
          .setStyle(isUserFavorite ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setLabel('Open in Steam')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://store.steampowered.com/app/${appId}`),
        new ButtonBuilder()
          .setLabel('Owner Server')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discord.gg/7GaTSkCUyU')
      ];

      components = [new ActionRowBuilder().addComponents(firstRow)];

      // Note: ManifestHub button will be added later via background check if needed
      try {
        await interaction.editReply({ embeds: [successEmbed], components, files: [attachment] });
      } catch (err) {
        console.error('Failed to send final reply with attachment:', err);
      }
    } else {
      // For large files, upload to external service
      try {
        downloadUrl = await uploadFile(zipBuffer, `${gameData.name}-${appId}.zip`);
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
      successEmbed.setDescription(await t('UPLOAD_COMPLETE_DESCRIPTION', guildId));
      
      const firstRow = [
        new ButtonBuilder()
          .setLabel('Download')
          .setStyle(ButtonStyle.Link)
          .setURL(downloadUrl)
          .setEmoji(emojis.Download),
        new ButtonBuilder()
          .setCustomId(`patches_${appId}`)
          .setLabel('Patches & Fixes')
          .setEmoji('🔧')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`request-update_${appId}`)
          .setLabel('Request Update')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('Open in Steam')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://store.steampowered.com/app/${appId}`),
        new ButtonBuilder()
          .setLabel('Owner Server')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discord.gg/your-server-invite')
      ];
      
      components = [new ActionRowBuilder().addComponents(firstRow)];

      // Note: ManifestHub button will be added later via background check if needed
      try {
        await interaction.editReply({ embeds: [successEmbed], components });
      } catch (err) {
        console.error('Failed to send final reply with download link:', err);
      }
    }
    console.log(`[PERF] Upload process: ${Date.now() - uploadStart}ms`);
    console.log(`[PERF] Embed building: ${Date.now() - embedStart}ms`);
    console.log(`[PERF] TOTAL TIME: ${Date.now() - startTime}ms`);
    
    // Send detailed DLC status if available
    if (dlcAnalysis && dlcAnalysis.totalDLC > 0) {
      try {
        const dlcEmbed = new EmbedBuilder()
          .setTitle(`🎮 DLC Status: ${gameData.name}`)
          .setColor(dlcAnalysis.completion === 100 ? 0x57f287 : 0xffa500)
          .setThumbnail(gameData.header_image);

        // DLC Summary
        const dlcSummary = `📊 **Total DLC:** ${dlcAnalysis.totalDLC}\n` +
          `✅ **Existing:** ${dlcAnalysis.existingDLC} | ❌ **Missing:** ${dlcAnalysis.missingDLC}\n` +
          `📈 **Completion:** ${dlcAnalysis.completion}%`;

        dlcEmbed.addFields({ name: '📋 Summary', value: dlcSummary, inline: false });

        // Show missing DLCs
        const missingDLCs = dlcAnalysis.dlcDetails.filter(dlc => !dlc.exists);
        if (missingDLCs.length > 0) {
          const missingList = missingDLCs.slice(0, 10).map(dlc => 
            `• **${dlc.name}** (${dlc.appId})`
          ).join('\n');
          
          dlcEmbed.addFields({ 
            name: `❌ Missing DLCs (${missingDLCs.length})`, 
            value: missingList + (missingDLCs.length > 10 ? '\n... and more' : ''), 
            inline: false 
          });
        }

        // Show outdated DLCs
        const outdatedDLCs = dlcAnalysis.dlcDetails.filter(dlc => dlc.exists && !dlc.isUpToDate);
        if (outdatedDLCs.length > 0) {
          const outdatedList = outdatedDLCs.slice(0, 5).map(dlc => 
            `• **${dlc.name}** (${dlc.manifestId} → ${dlc.latestManifestId})`
          ).join('\n');
          
          dlcEmbed.addFields({ 
            name: `🔄 Outdated DLCs (${outdatedDLCs.length})`, 
            value: outdatedList + (outdatedDLCs.length > 5 ? '\n... and more' : ''), 
            inline: false 
          });
        }

        await interaction.followUp({ embeds: [dlcEmbed], flags: 64 });
      } catch (err) {
        console.error('Failed to send DLC status:', err);
      }
    }

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
      if (err.code === 10062) {
        console.log('Interaction expired during usage info send');
        return;
      }
    }

    // Button interaction collector for Patches & Fixes
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000 // 5 minutes
    });
    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === `patches_${appId}`) {
        if (btnInt.user.id !== user.id) {
          await btnInt.reply({ content: 'Only the requester can use this button.', flags: 64 });
          return;
        }
        const links = getPatchLinks(gameData.name);
        await btnInt.reply({
          content: `🔧 **Patches & Fixes for ${gameData.name}**\nFind patches and fixes for this game on the following sites:\n${links.join('\n')}\n\nRequested by ${user.toString()}`,
          flags: 64
        });
      }
      // You can add more button handlers here if needed
    });

    // Background manifest check (non-blocking)
    setImmediate(async () => {
      try {
        console.log(`[MANIFEST] Starting background update check for ${appId}...`);
        const manifestUpdateResult = await autoUpdateOnRequest(appId);
        
        if (manifestUpdateResult.updated && manifestUpdateResult.hasUpdate) {
          const updateCount = Object.keys(manifestUpdateResult.depotUpdates || {}).length;
          console.log(`[MANIFEST] ✅ Background update completed for ${appId}: ${updateCount} depots updated`);
        } else if (manifestUpdateResult.error) {
          console.log(`[MANIFEST] ⚠️ Background update check failed for ${appId}: ${manifestUpdateResult.error}`);
        } else {
          console.log(`[MANIFEST] ℹ️ No updates needed for ${appId}`);
        }
      } catch (error) {
        console.error(`[MANIFEST] Background update error for ${appId}:`, error);
      }
    });

  } catch (error) {
    console.error('Error in gen command:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred.', flags: 64 });
    } else {
      await interaction.reply({ content: 'An error occurred.', flags: 64 });
    }
  }
}