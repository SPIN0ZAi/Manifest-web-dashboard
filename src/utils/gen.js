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
import { validateAppId } from '../utils/steam.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { createZipArchive } from '../utils/zip.js';
import { uploadFile } from '../utils/uploader.js';
import { t, getNested, locales, getLanguage } from '../utils/localization.js';
import { getDb } from '../utils/database.js';
import { checkAndUpdateUsage } from '../utils/usageTracker.js';
import { emojis } from '../utils/emojis.js';
import { getStoredBuildVersion } from '../utils/manifestProcessor.js';
import fs from 'node:fs';
import path from 'node:path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load filtered tags and whitelist
const filteredTags = JSON.parse(fs.readFileSync(path.join(__dirname, 'filteredTags.json'), 'utf-8'));
const gameWhitelist = JSON.parse(fs.readFileSync(path.join(__dirname, 'gameWhitelist.json'), 'utf-8'));

// Simple in-memory cache (could be replaced with DB or file-based cache)
const steamInfoCache = new Map();
const ccuCache = new Map();
const filterCache = new Map(); // Cache filter results to avoid repeated AI calls
const fuzzySearchCache = new Map(); // Cache fuzzy search results
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const FILTER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for filter results
// Performance tracking
let aiCallsToday = 0;
let cacheHitsToday = 0;
let knownSafeHitsToday = 0;
let patternMatchHitsToday = 0;

/**
 * Reset daily stats (call this once per day)
 */
export function resetDailyStats() {
  aiCallsToday = 0;
  cacheHitsToday = 0;
  knownSafeHitsToday = 0;
  patternMatchHitsToday = 0;
  console.log('📊 Daily filter stats reset');
}

/**
 * Get current filter performance stats
 */
export function getFilterStats() {
  const totalRequests = aiCallsToday + cacheHitsToday + knownSafeHitsToday + patternMatchHitsToday;
  return {
    totalRequests,
    aiCalls: aiCallsToday,
    cacheHits: cacheHitsToday,
    knownSafeHits: knownSafeHitsToday,
    patternMatchHits: patternMatchHitsToday,
    aiPercentage: totalRequests > 0 ? (aiCallsToday / totalRequests * 100).toFixed(1) : 0
  };
}

const STEAM_INFO_CACHE_FILE = path.join(__dirname, 'steamInfoCache.json');
const CCU_CACHE_FILE = path.join(__dirname, 'ccuCache.json');
const FILTER_CACHE_FILE = path.join(__dirname, 'filterCache.json');

// Known safe games that never need AI filtering (popular mainstream games)
const KNOWN_SAFE_GAMES = new Set([
  // Popular shooters
  '730', '440', '570', '4000', '1818750', // CS2, TF2, Dota 2, Garry's Mod, Call of Duty MW
  '1938090', '7940', '346110', '435150', '42700', '42710', // More Call of Duty games
  '359550', '1085660', // Rainbow Six Siege, Destiny 2
  '578080', '271590', '391220', // PUBG, GTA V, Rust
  '1172470', '1144200', // Apex Legends, Ready or Not
  
  // Sports games - FIFA series
  '1174180', '1265380', '1590320', '1506830', '1313860', '1313860',
  // F1 series
  '1919590', '1466860', '1468810', '3059520', '1692250',
  // Other sports
  '1939690', '1248803', '2239150', // NBA 2K series
  
  // Popular AAA games
  '22330', '22300', '22380', '377160', '489830', // Fallout series
  '72850', '489830', '377160', '1716740', // Elder Scrolls series
  '292030', '1091500', '499450', // Witcher series
  '1174180', '271590', '1085660', // Major AAA titles
  
  // Popular multiplayer games
  '386360', '1172470', '236390', '252490', // Smite, Apex, War Thunder, Rust
  '9420', '359550', '582010', // The Ship, Rainbow Six, Monster Hunter
  
  // Popular indie games
  '105600', '413150', '218620', '251570', // Terraria, Stardew Valley, Hotline Miami, 7 Days
  '1245620', '1091500', '524220', '427520', // ELDEN RING, Cyberpunk, NieR, Factorio
  
  // Minecraft-likes and crafting
  '105600', '251570', '427520', '620980', // Terraria, 7 Days, Factorio, Beat Saber
  
  // Racing games
  '1551360', '1222670', '1172620', '636480', // Forza series, Dirt, etc.
  
  // Fighting games
  '1384160', '310950', '389730', '1384160', // Street Fighter, Mortal Kombat, Tekken
  
  // Strategy games
  '394360', '236850', '8930', '570', // Hearts of Iron, Europa, Civ V, Dota 2
]);

export const STRONG_NSFW_TAGS = [
  "Hentai",
  "NSFW",
  "Adult Only",
  "Anime Nudity",
  "Erotic",
  "Dating Sim",
  "Visual Novel",
  "Explicit Sexual Content",
  "Hardcore",
  "Uncensored"
];
export const CONDITIONAL_TAGS = [
  "Female Protagonist",
  "LGBTQ+",
  "Furry"
];

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
    
    // Search for games by name using fuzzy matching
    const suggestions = await fuzzyFindGames(focusedValue, 25);
    
    const choices = suggestions.map(game => ({
      name: `${game.name} (ID: ${game.appId})`.slice(0, 100), // Discord limit
      value: game.appId.toString()
    }));
    
    await interaction.respond(choices);
  } catch (error) {
    console.error('Autocomplete error:', error);
    await interaction.respond([]);
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

// Helper for fuzzy/partial keyword matching
function containsFilteredKeyword(text, keywords) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(keyword => lower.includes(keyword.toLowerCase()));
}

/**
 * Smart filter: Distinguishes between legitimate software with adult content and actual NSFW/hentai games.
 * @param {Object} gameData - Should include appid, tags, short_description, detailed_description, peak_ccu, review_count, review_score, etc.
 * @returns {Object} { filtered: boolean, reason: string, whitelisted: boolean }
 */
export async function fetchSteamTagsFromStorePage(appid) {
  const url = `https://store.steampowered.com/app/${appid}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    let tags = [];
    // Try to match tags in the glance_tags popular_tags section
    let tagRegex = /<a[^>]*class="app_tag"[^>]*>([^<]+)<\/a>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      tags.push(match[1].trim());
    }
    // Try <span class="app_tag"> as fallback
    if (tags.length === 0) {
      tagRegex = /<span[^>]*class="app_tag"[^>]*>([^<]+)<\/span>/g;
      while ((match = tagRegex.exec(html)) !== null) {
        tags.push(match[1].trim());
      }
    }
    if (tags.length === 0) {
      const snippet = html.slice(0, 10000);
      console.warn(`[SCRAPE WARNING] No community tags found for appid ${appid}. HTML snippet:\n`, snippet);
    }
    console.log(`[DEBUG] Scraped community tags for appid ${appid}:`, tags);
    return tags;
  } catch (e) {
    console.error(`[SteamScrape] Failed to fetch tags for appid ${appid}:`, e);
    return [];
  }
}

/**
 * Fetches Steam Store info (tags, reviews, etc) for a given appid, with caching and error logging.
 * @param {number|string} appid
 * @returns {Promise<Object|null>}
 */
export async function fetchSteamStoreInfo(appid) {
  appid = String(appid);
  const now = Date.now();
  if (steamInfoCache.has(appid)) {
    const { data, ts } = steamInfoCache.get(appid);
    if (now - ts < CACHE_TTL) return data;
  }
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data[appid] || !data[appid].success) return null;
    const game = data[appid].data;
    // Only use community tags scraped from the store page
    const tags = await fetchSteamTagsFromStorePage(appid);
    console.log(`[DEBUG] fetchSteamStoreInfo using ONLY community tags for appid ${appid}:`, tags);
    const result = {
      tags,
      review_count: game.recommendations?.total || 0,
      review_score: game.metacritic?.score || null,
      review_desc: game.metacritic?.url ? 'Metacritic' : (game.recommendations?.total > 0 ? 'Positive' : 'Unknown'),
      name: game.name,
      header_image: game.header_image,
      appid: Number(appid),
      short_description: game.short_description || '',
      detailed_description: game.detailed_description || ''
    };
    steamInfoCache.set(appid, { data: result, ts: now });
    saveCacheToDisk();
    return result;
  } catch (e) {
    console.error(`[SteamAPI] Failed to fetch store info for appid ${appid}:`, e);
    return null;
  }
}

/**
 * Fetches peak concurrent players (CCU) from SteamCharts, with caching and error logging.
 * @param {number|string} appid
 * @returns {Promise<number|null>}
 */
export async function fetchPeakCCU(appid) {
  appid = String(appid);
  const now = Date.now();
  if (ccuCache.has(appid)) {
    const { data, ts } = ccuCache.get(appid);
    if (now - ts < CACHE_TTL) return data;
  }
  const url = `https://steamcharts.com/app/${appid}/chart-data.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const peak = Math.max(...data.map(arr => arr[1]));
    ccuCache.set(appid, { data: peak, ts: now });
    saveCacheToDisk();
    return peak;
  } catch (e) {
    console.error(`[SteamCharts] Failed to fetch CCU for appid ${appid}:`, e);
    return null;
  }
}

/**
 * Admin utility to clear all caches.
 */
export function clearSteamCaches() {
  steamInfoCache.clear();
  ccuCache.clear();
  filterCache.clear();
  saveCacheToDisk();
}

/**
 * Admin utility to clear only filter cache (useful for testing filter changes).
 */
export function clearFilterCache() {
  filterCache.clear();
  saveCacheToDisk();
  console.log('[ADMIN] Filter cache cleared');
}

/**
 * Fuzzy search for similar game names in the database, only returning games that would not be blocked by the filter.
 * @param {string} query - The user's input (partial or misspelled game name)
 * @param {number} maxResults - Max number of results to return
 * @returns {Promise<Array<{appId: number, name: string}>>}
 */
/**
 * Optimized fuzzy search with caching for better autocomplete performance
 */
export async function fuzzyFindGames(query, maxResults = 5) {
  if (!query) return [];
  
  const now = Date.now();
  const cacheKey = `${query.toLowerCase()}_${maxResults}`;
  
  // Check cache first
  if (fuzzySearchCache.has(cacheKey)) {
    const { data, timestamp } = fuzzySearchCache.get(cacheKey);
    if (now - timestamp < FUZZY_CACHE_TTL) {
      return data;
    }
  }
  
  const db = await getDb();
  const q = query.toLowerCase();
  
  // Optimized search: first try exact matches, then substring, then fuzzy
  let results = [];
  
  // 1. Exact name matches (fastest)
  const exactMatches = await db.collection('games')
    .find(
      { name: { $regex: new RegExp(`^${query}$`, 'i') } },
      { projection: { appId: 1, name: 1 }, limit: maxResults }
    )
    .toArray();
  
  results.push(...exactMatches);
  
  // 2. Substring matches if we need more results
  if (results.length < maxResults) {
    const remaining = maxResults - results.length;
    const substringMatches = await db.collection('games')
      .find(
        { 
          name: { $regex: new RegExp(query, 'i') },
          appId: { $nin: results.map(r => r.appId) } // Exclude already found
        },
        { projection: { appId: 1, name: 1 }, limit: remaining }
      )
      .toArray();
    
    results.push(...substringMatches);
  }
  
  // 3. Fuzzy matching only if we still need more (most expensive)
  if (results.length < maxResults && query.length >= 3) {
    const remaining = maxResults - results.length;
    const allGames = await db.collection('games')
      .find(
        { appId: { $nin: results.map(r => r.appId) } },
        { projection: { appId: 1, name: 1 }, limit: 100 } // Limit to prevent timeout
      )
      .toArray();
    
    // Simple distance calculation (faster than full Levenshtein)
    const fuzzyMatches = allGames
      .map(game => {
        const name = game.name.toLowerCase();
        let score = 0;
        
        // Simple scoring based on character presence
        for (const char of q) {
          if (name.includes(char)) score++;
        }
        
        // Bonus for word starts
        const words = name.split(' ');
        for (const word of words) {
          if (word.startsWith(q.substring(0, 3))) {
            score += 10;
          }
        }
        
        return { ...game, score };
      })
      .filter(game => game.score > q.length * 0.3) // Minimum relevance
      .sort((a, b) => b.score - a.score)
      .slice(0, remaining);
    
    results.push(...fuzzyMatches);
  }
  
  // Cache the results
  fuzzySearchCache.set(cacheKey, { data: results, timestamp: now });
  
  return results;
}

export async function execute(interaction) {
  const gameInput = interaction.options.getString('game');
  const guildId = interaction.guildId;
  const user = interaction.user;

  try {
    // 1) Usage limit check
    const usage = await checkAndUpdateUsage(user.id, guildId, interaction);
    if (usage.error) {
      const lang = await getLanguage(guildId);
      const isKey =
        getNested(locales.get(lang), usage.message) ||
        getNested(locales.get('en'), usage.message);
      const content = isKey
        ? await t(usage.message, guildId)
        : usage.message;

      return interaction.reply({ content });
    }

    // 2) Defer for long‑running work (public)
    await interaction.deferReply();

    // 3) Determine if input is AppID or game name and get the actual AppID
    let appId;
    let gameData;
    let notFound = false;

    if (isAppId(gameInput)) {
      // Input is an AppID
      appId = gameInput;
      try {
        gameData = await validateAppId(appId);
      } catch (error) {
        notFound = true;
      }
    } else {
      // Input is a game name, search in database
      const foundGame = await findGameByName(gameInput);
      if (foundGame) {
        appId = foundGame.appId;
        try {
          gameData = await validateAppId(appId);
        } catch (error) {
          gameData = foundGame;
        }
      } else {
        // Game not found, try to provide suggestions
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
          notFound = true;
        }
      }
    }

    // 4) Show "validating" status
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

    // 5) Update stats
    await updateStats(appId);

    // 6) Fetch files
    let files;
    try {
      files = await fetchFilesFromRepo(appId);
    } catch (err) {
      notFound = true;
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

    // 7) Show "fetching files" status
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            `${emojis.Success} ${await t('VALIDATED_GAME', guildId, { gameName: gameData.name })}`
          )
          .setDescription(`${emojis.Load} ${await t('FETCHING_FILES', guildId)}`)
          .setColor(0x00ff00)
          .setThumbnail(gameData.header_image)
      ]
    });

    // 8) Show "zipping" status
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            `${emojis.Success} ${await t('FOUND_FILES', guildId, { count: files.length, gameName: gameData.name })}`
          )
          .setDescription(`${emojis.Load} ${await t('ZIPPING_FILES', guildId)}`)
          .setColor(0x00ff00)
          .setThumbnail(gameData.header_image)
      ]
    });

    // 9) Zip into buffer
    const zipBuffer = await createZipArchive(files);

    // 10) Persist in DB
    const db = await getDb();
    await db.collection('games').updateOne(
      { appId },
      { $set: { name: gameData.name, lastUpdated: new Date(), requester: user.id } },
      { upsert: true }
    );

    // 11) Build success embed
    const zipSizeMB = zipBuffer.length / (1024 * 1024);
    const DISCORD_LIMIT = 7.9;

    const buildSuccessEmbed = async () => {
      const embed = new EmbedBuilder()
        .setTitle(
          `${emojis.Success} ${await t('SUCCESS_DESCRIPTION', guildId, { gameName: gameData.name })}`
        )
        .setThumbnail(gameData.header_image)
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
      return embed;
    };

    // 12) Upload to Discord or external
    let downloadUrl = null;
    let successEmbed = await buildSuccessEmbed();
    let components = [];
    if (zipSizeMB < DISCORD_LIMIT) {
      const attachment = new AttachmentBuilder(zipBuffer, { name: `${gameData.name}-${appId}.zip` });
      successEmbed.setDescription(
        await t('SUCCESS_ATTACHED_DESCRIPTION', guildId, { gameName: gameData.name })
      );
      // Buttons: Patches, Request Update, Open in Steam, Get Files
      components = [
        new ActionRowBuilder().addComponents(
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
            .setCustomId(`getfiles_${appId}`)
            .setLabel('Get Files')
            .setEmoji('📦')
            .setStyle(ButtonStyle.Success)
        )
      ];
      await interaction.editReply({ embeds: [successEmbed], components });
      const usageEmbed = new EmbedBuilder()
        .setDescription(`🔢 ${await t('FIELD_DAILY_USAGE', guildId)}: ${usage.currentUsage}/${usage.limit}`)
        .setColor(0x5865F2);
      await interaction.followUp({ embeds: [usageEmbed], flags: 64 });
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('SUCCESS_DESCRIPTION', guildId, { gameName: gameData.name })}`)
            .setDescription(await t('UPLOADING_DESCRIPTION', guildId, { size: zipSizeMB.toFixed(2) }))
            .setColor(0x5865f2)
            .setThumbnail(gameData.header_image)
        ]
      });
      downloadUrl = await uploadFile(zipBuffer, `${gameData.name}-${appId}.zip`);
      successEmbed = await buildSuccessEmbed();
      successEmbed.setDescription(await t('UPLOAD_COMPLETE_DESCRIPTION', guildId));
      components = [
        new ActionRowBuilder().addComponents(
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
            .setCustomId(`getfiles_${appId}`)
            .setLabel('Get Files')
            .setEmoji('📦')
            .setStyle(ButtonStyle.Success)
        )
      ];
      await interaction.editReply({ embeds: [successEmbed], components });
      const usageEmbed = new EmbedBuilder()
        .setDescription(`🔢 ${await t('FIELD_DAILY_USAGE', guildId)}: ${usage.currentUsage}/${usage.limit}`)
        .setColor(0x5865F2);
      await interaction.followUp({ content: downloadUrl, embeds: [usageEmbed], flags: 64 });
    }

    // Button interaction collector for Patches & Fixes and Get Files
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000 // 5 minutes
    });
    collector.on('collect', async (btnInt) => {
      if (btnInt.customId === `patches_${appId}`) {
        if (btnInt.user.id !== user.id) {
          await btnInt.reply({ content: 'Only the requester can use this button.', ephemeral: true });
          return;
        }
        const links = getPatchLinks(gameData.name);
        await btnInt.reply({
          content: `🔧 **Patches & Fixes for ${gameData.name}**\nFind patches and fixes for this game on the following sites:\n${links.join('\n')}\n\nRequested by ${user.toString()}`,
          ephemeral: true
        });
      } else if (btnInt.customId === `getfiles_${appId}`) {
        // Anyone can use this button
        if (zipSizeMB < DISCORD_LIMIT) {
          // Send as attachment
          const attachment = new AttachmentBuilder(zipBuffer, { name: `${gameData.name}-${appId}.zip` });
          await btnInt.reply({
            content: `Here are the files for **${gameData.name}** (AppID: \`${appId}\`)`,
            files: [attachment],
            ephemeral: true
          });
        } else {
          // Send as download link
          if (!downloadUrl) {
            downloadUrl = await uploadFile(zipBuffer, `${gameData.name}-${appId}.zip`);
          }
          await btnInt.reply({
            content: `Here is the download link for **${gameData.name}** (AppID: \`${appId}\`):\n${downloadUrl}`,
            ephemeral: true
          });
        }
      }
      // You can add more button handlers here if needed
    });

  } catch (error) {
    console.error('Error in gen command:', error);
  }
}

// Restore isGameWhitelisted and getBaseGameIfDLC exports
export function isGameWhitelisted(appid) {
  return gameWhitelist.includes(Number(appid));
}

export function getBaseGameIfDLC(gameData) {
  if (gameData && gameData.isDLC && gameData.parentAppId) {
    return gameData.parentAppId;
  }
  return null;
}

// Helper: AI-based fallback filter using Groq API
async function aiAdultContentCheck(gameData) {
  if (!process.env.GROQ_API_KEY) {
    console.warn('[AI FILTER] No Groq API key set. Skipping AI filter.');
    return { aiBlocked: false, aiReason: 'No API key (allowing by default)' };
  }
  
  // First, check for obvious mainstream games that should never be blocked
  const mainStreamIndicators = [
    'call of duty', 'cod', 'battlefield', 'fifa', 'madden', 'nba 2k', 'f1 2', 'fortnite',
    'apex legends', 'valorant', 'counter-strike', 'cs2', 'csgo', 'gta', 'grand theft auto',
    'assassin\'s creed', 'the witcher', 'cyberpunk', 'red dead', 'elder scrolls', 'fallout',
    'doom', 'halo', 'destiny', 'overwatch', 'league of legends', 'dota', 'rocket league',
    'minecraft', 'terraria', 'stardew valley', 'among us', 'fall guys', 'pubg'
  ];
  
  const gameName = (gameData.name || '').toLowerCase();
  if (mainStreamIndicators.some(indicator => gameName.includes(indicator))) {
    console.log(`[AI FILTER] Allowing mainstream game: ${gameData.name}`);
    return { aiBlocked: false, aiReason: 'Mainstream game allowed' };
  }
  
  const prompt = `Game Name: ${gameData.name}\nTags: ${(gameData.tags || []).join(', ')}\nSystem Tags: ${(gameData.systemTags || []).join(', ')}\nDescription: ${gameData.short_description || ''}\n\nIs this game primarily focused on explicit sexual content, hentai, or adult/erotic themes? \n\nIMPORTANT: Games with violence, mature themes, occasional nudity, or M-rated content (like Call of Duty, GTA, Cyberpunk, Mortal Kombat) should be answered NO.\n\nOnly answer YES if the game is explicitly an adult/sex game, hentai, dating sim with sexual content, or primarily focused on erotic themes.\n\nAnswer YES or NO and explain why.`;
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.1
      })
    });
    if (!response.ok) {
      throw new Error(`[Groq API] HTTP ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    const aiText = data.choices[0].message.content.trim();
    // Robustly detect YES/NO in the first line, ignoring formatting
    const firstLine = aiText.split('\n')[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
    const isAdult = firstLine.startsWith('yes');
    console.log(`[AI FILTER] (Groq) Game "${gameData.name}" (${gameData.appid}) - AI flagged as adult: ${isAdult ? 'YES' : 'NO'} | Reason: ${aiText}`);
    return { aiBlocked: isAdult, aiReason: aiText };
  } catch (e) {
    console.error('[AI FILTER] Groq API error:', e);
    // If AI fails, allow the game rather than blocking it
    return { aiBlocked: false, aiReason: 'Groq API error (allowing by default)' };
  }
}

// Efficient filtering: use cache, known safe games, and AI only when necessary
export async function isGameFiltered(gameData) {
  const appId = String(gameData.appid);
  
  // 1. Always allow whitelisted games
  if (isGameWhitelisted(gameData.appid)) {
    return {
      filtered: false,
      reason: 'Whitelisted game',
      whitelisted: true
    };
  }
  
  // 2. Check cache first to avoid repeated AI calls
  const now = Date.now();
  if (filterCache.has(appId)) {
    const { result, timestamp } = filterCache.get(appId);
    if (now - timestamp < FILTER_CACHE_TTL) {
      cacheHitsToday++;
      console.log(`[FILTER] Cache hit: ${gameData.name} (${appId})`);
      return result;
    }
  }
  
  // 3. Check if it's a known safe game (no AI needed)
  if (KNOWN_SAFE_GAMES.has(appId)) {
    knownSafeHitsToday++;
    const result = {
      filtered: false,
      reason: 'Known safe game',
      whitelisted: false
    };
    filterCache.set(appId, { result, timestamp: now });
    console.log(`[FILTER] Known safe: ${gameData.name} (${appId})`);
    return result;
  }
  
  // 4. Check for obvious mainstream game patterns (no AI needed)
  const gameName = (gameData.name || '').toLowerCase();
  const mainStreamPatterns = [
    'call of duty', 'cod', 'battlefield', 'fifa', 'madden', 'nba 2k', 'f1 2', 'formula 1',
    'fortnite', 'apex legends', 'valorant', 'counter-strike', 'cs2', 'csgo', 'gta', 
    'grand theft auto', 'assassins creed', 'the witcher', 'cyberpunk', 'red dead',
    'elder scrolls', 'fallout', 'doom', 'halo', 'destiny', 'overwatch', 'league of legends',
    'dota', 'rocket league', 'minecraft', 'terraria', 'stardew valley', 'among us',
    'fall guys', 'pubg', 'mortal kombat', 'street fighter', 'tekken', 'apex', 'warframe',
    'rainbow six', 'rainbow 6', 'r6', 'forza', 'elden ring', 'dark souls', 'sekiro',
    'monster hunter', 'final fantasy', 'resident evil', 'silent hill', 'dead by daylight'
  ];
  
  if (mainStreamPatterns.some(pattern => gameName.includes(pattern))) {
    patternMatchHitsToday++;
    const result = {
      filtered: false,
      reason: 'Mainstream game pattern recognized',
      whitelisted: false
    };
    filterCache.set(appId, { result, timestamp: now });
    console.log(`[FILTER] Pattern match: ${gameData.name} (${appId})`);
    return result;
  }
  
  // 5. Check for obvious adult content patterns (block without AI)
  const adultPatterns = [
    'hentai', 'nsfw', 'adult only', 'erotic', 'sex', 'porn', 'xxx', 'lewd',
    'ecchi', 'oppai', 'waifu simulator', 'dating sim', 'visual novel',
    'strip poker', 'nude', 'naked', 'uncensored'
  ];
  
  if (adultPatterns.some(pattern => gameName.includes(pattern))) {
    const result = {
      filtered: true,
      reason: 'Adult content pattern detected',
      whitelisted: false
    };
    filterCache.set(appId, { result, timestamp: now });
    console.log(`[FILTER] Adult pattern blocked: ${gameData.name} (${appId})`);
    return result;
  }
  
  // 6. Only use AI for ambiguous cases (saves tokens!)
  aiCallsToday++;
  console.log(`[FILTER] AI needed for: ${gameData.name} (${appId}) [Daily AI calls: ${aiCallsToday}]`);
  const aiResult = await aiAdultContentCheck(gameData);
  
  const result = {
    filtered: aiResult.aiBlocked,
    reason: aiResult.aiBlocked ? `[AI FILTER] Blocked: ${aiResult.aiReason}` : `[AI FILTER] Allowed: ${aiResult.aiReason}`,
    whitelisted: false
  };
  
  // Cache the result
  filterCache.set(appId, { result, timestamp: now });
  saveCacheToDisk();
  
  console.log(`[AI FILTER] ${result.filtered ? 'Blocked' : 'Allowed'}: ${gameData.name} (${appId}) - ${aiResult.aiReason}`);
  return result;
}

function saveCacheToDisk() {
  try {
    fs.writeFileSync(STEAM_INFO_CACHE_FILE, JSON.stringify(Array.from(steamInfoCache.entries())), 'utf-8');
    fs.writeFileSync(CCU_CACHE_FILE, JSON.stringify(Array.from(ccuCache.entries())), 'utf-8');
    fs.writeFileSync(FILTER_CACHE_FILE, JSON.stringify(Array.from(filterCache.entries())), 'utf-8');
  } catch (e) {
    console.error('[Cache] Failed to save cache to disk:', e);
  }
}

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(STEAM_INFO_CACHE_FILE)) {
      const arr = JSON.parse(fs.readFileSync(STEAM_INFO_CACHE_FILE, 'utf-8'));
      steamInfoCache.clear();
      for (const [k, v] of arr) steamInfoCache.set(k, v);
    }
    if (fs.existsSync(CCU_CACHE_FILE)) {
      const arr = JSON.parse(fs.readFileSync(CCU_CACHE_FILE, 'utf-8'));
      ccuCache.clear();
      for (const [k, v] of arr) ccuCache.set(k, v);
    }
    if (fs.existsSync(FILTER_CACHE_FILE)) {
      const arr = JSON.parse(fs.readFileSync(FILTER_CACHE_FILE, 'utf-8'));
      filterCache.clear();
      for (const [k, v] of arr) filterCache.set(k, v);
    }
  } catch (e) {
    console.error('[Cache] Failed to load cache from disk:', e);
  }
}

// Load cache on startup
loadCacheFromDisk();

// Save cache on process exit
process.on('exit', saveCacheToDisk);
process.on('SIGINT', saveCacheToDisk);
process.on('SIGTERM', saveCacheToDisk);