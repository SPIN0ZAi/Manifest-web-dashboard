import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { validateAppId } from '../utils/steam.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import { isGameFiltered, getBaseGameIfDLC, fetchSteamStoreInfo, fetchPeakCCU, fuzzyFindGames } from '../utils/gen.js';

// Function to search for game by name in database
async function findGameByName(gameName) {
  const db = await getDb();
  const game = await db.collection('games').findOne(
    { name: { $regex: new RegExp(gameName, 'i') } },
    { sort: { lastUpdated: -1 } }
  );
  return game;
}

// Function to determine if input is an AppID (numeric) or game name
function isAppId(input) {
  return /^\d+$/.test(input.trim());
}

export const data = new SlashCommandBuilder()
  .setName('checkgame')
  .setDescription('Check if a game (by Steam AppID or game name) exists in the database')
  .addStringOption(opt =>
    opt.setName('game')
      .setDescription('The Steam AppID (e.g., 730) or game name (e.g., Counter-Strike 2)')
      .setRequired(true)
  );

export async function execute(interaction) {
  const gameInput = interaction.options.getString('game');
  
  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    console.error('Failed to defer reply:', err);
    return;
  }

  let appId;
  let gameData;

  // Determine if input is AppID or game name
  if (isAppId(gameInput)) {
    // Input is an AppID
    appId = gameInput;
    
    // Validate AppID format
    if (!/^\d+$/.test(appId)) {
      try {
        return await interaction.editReply({
          content: `${emojis.Error || '❌'} Invalid AppID format. Please provide a numeric AppID.`
        });
      } catch (err) {
        console.error('Failed to reply with invalid AppID error:', err);
        return;
      }
    }

    // Try to validate on Steam
    try {
      gameData = await validateAppId(appId);
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
        } else {
          gameData = { appid: appId, name: 'Unknown Game' };
        }
      } catch {
        gameData = { appid: appId, name: 'Unknown Game' };
      }
    }
  } else {
    // Input is a game name, search in database
    try {
      const foundGame = await findGameByName(gameInput);
      if (!foundGame) {
        try {
          return await interaction.editReply({
            content: `${emojis.Error || '❌'} Game "${gameInput}" not found in database.`
          });
        } catch (err) {
          console.error('Failed to reply with game not found error:', err);
          return;
        }
      }
      
      appId = foundGame.appId;
      
      // Validate the found AppID on Steam
      try {
        gameData = await validateAppId(appId);
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
          } else {
            gameData = { appid: appId, name: 'Unknown Game' };
          }
        } catch {
          gameData = { appid: appId, name: 'Unknown Game' };
        }
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      try {
        return await interaction.editReply({
          content: `${emojis.Error || '❌'} Database error occurred while searching for game.`
        });
      } catch (err) {
        console.error('Failed to reply with database error:', err);
        return;
      }
    }
  }

  // After gameData is loaded and before fetchFilesFromRepo
  // --- Fetch Steam info and CCU for filtering ---
  let steamInfo = null;
  let peakCCU = null;
  try {
    steamInfo = await fetchSteamStoreInfo(appId);
    peakCCU = await fetchPeakCCU(appId);
  } catch (e) {
    console.error('Failed to fetch Steam info:', e);
  }
  if (steamInfo) {
    gameData = { ...gameData, ...steamInfo, peak_ccu: peakCCU };
  } else {
    gameData = { ...gameData, peak_ccu: peakCCU };
  }

  // --- NSFW/Low-Quality Filtering & DLC Handling ---
  let filterResult;
  try {
    filterResult = isGameFiltered(gameData);
  } catch (filterError) {
    console.error('AI filter error:', filterError);
    // Default to not filtered if AI check fails
    filterResult = { filtered: false, whitelisted: false, reason: 'AI check failed' };
  }
  // BYPASS: Do not block explicit or adult-only content
  // if (filterResult.filtered) {
  //   // Suggest similar games
  //   const suggestions = await fuzzyFindGames(gameData.name, 3);
  //   let suggestionMsg = '';
  //   if (suggestions.length) {
  //     suggestionMsg = '\n\nSimilar mainstream games you can try:\n' + suggestions.map(g => `\u2022 **${g.name}** (AppID: \`${g.appId || g.appid}\`)`).join('\n');
  //   }
  //   return interaction.editReply({
  //     content: `I can't check this game because it contains explicit or adult-only content that we don't support here.${suggestionMsg}`,
  //     embeds: []
  //   });
  // }
  if (filterResult.whitelisted) {
    try {
      await interaction.followUp({
        content: `This game contains mature content, but it's a mainstream title — checking the game now...`,
        ephemeral: true
      });
    } catch (err) {
      console.error('Failed to send whitelist message:', err);
    }
  }

  const baseAppId = getBaseGameIfDLC(gameData);
  if (baseAppId) {
    // Try to fetch the base game data
    let baseGameData;
    try {
      baseGameData = await validateAppId(baseAppId);
    } catch (e) {
      try {
        return await interaction.editReply({
          content: `I can't check DLCs on their own, and couldn't find the base game. Please contact staff.`,
          embeds: []
        });
      } catch (err) {
        console.error('Failed to reply with DLC error:', err);
        return;
      }
    }
    try {
      await interaction.editReply({
        content: `I can't check DLCs on their own. Instead, please check the full game — it includes the DLC content when available.`,
        embeds: []
      });
    } catch (err) {
      console.error('Failed to reply with DLC message:', err);
      return;
    }
    appId = baseAppId;
    gameData = baseGameData;
  }

  // Check if the game exists in the database (GitHub repo)
  try {
    await fetchFilesFromRepo(appId);
    // If no error, game exists
    const embed = new EmbedBuilder()
      .setTitle(`${emojis.Success || '✅'} Game Exists in Database`)
      .setDescription(`**${gameData.name}** (AppID: \`${appId}\`) exists in the database.`)
      .setColor(0x57F287)
      .setThumbnail(gameData.header_image)
      .setURL(`https://store.steampowered.com/app/${appId}`)
      .setFooter({ text: 'SB MANIFEST' });
    try {
      return await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Failed to reply with game exists message:', err);
      return;
    }
  } catch (err) {
    // Not found in database
    const embed = new EmbedBuilder()
      .setTitle(`${emojis.Deined || '❌'} Game Not Found in Database`)
      .setDescription(`**${gameData.name}** (AppID: \`${appId}\`) does not exist in the database.`)
      .setColor(0xFF0000)
      .setThumbnail(gameData.header_image)
      .setURL(`https://store.steampowered.com/app/${appId}`)
      .setFooter({ text: 'SB MANIFEST' });
    try {
      return await interaction.editReply({ embeds: [embed] });
    } catch (replyErr) {
      console.error('Failed to reply with game not found message:', replyErr);
      return;
    }
  }
}