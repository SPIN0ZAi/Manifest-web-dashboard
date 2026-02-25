// Enhanced Manifest Updater with correct SteamCMD API structure
import { retryWithBackoff, getErrorMessage } from './network.js';
import { getDb } from './database.js';

// Rate limiting for SteamCMD API
const API_RATE_LIMIT = 2000; // 2 seconds between requests
let lastApiCall = 0;

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < API_RATE_LIMIT) {
    const waitTime = API_RATE_LIMIT - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastApiCall = Date.now();
}

/**
 * Get ManifestHub API key from database (manually set by admin)
 * @returns {Promise<string|null>} The API key or null if not found/expired
 */
export async function getManifestHubApiKey() {
  try {
    const db = await getDb();
    const config = await db.collection('config').findOne({ _id: 'manifesthub-api' });
    
    if (!config || !config.apiKey) {
      console.log('[MANIFEST] No ManifestHub API key found in database');
      return null;
    }
    
    // Check if key is expired (24 hours)
    if (config.expiresAt && new Date() > config.expiresAt) {
      console.log('[MANIFEST] ManifestHub API key has expired');
      return null;
    }
    
    return config.apiKey;
  } catch (error) {
    console.error('[MANIFEST] Error getting API key:', error);
    return null;
  }
}

/**
 * Get depot information from SteamCMD API
 * Structure: https://api.steamcmd.net/v1/info/{appid}
 * Returns depot data including manifests for public/beta/steam_legacy branches
 * @param {string} appId - The Steam App ID
 * @returns {Promise<Object|null>} Depot information or null if failed
 */
async function getSteamCmdInfo(appId) {
  try {
    await rateLimit(); // Respect rate limits
    
    const url = `https://api.steamcmd.net/v1/info/${appId}`;
    console.log(`[MANIFEST] Fetching SteamCMD info for ${appId}`);
    
    const response = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Discord-Bot-Manifest/1.0'
        },
        timeout: 15000
      });
      
      if (!res.ok) {
        throw new Error(`SteamCMD API returned ${res.status}: ${res.statusText}`);
      }
      
      return res.json();
    }, 3, `SteamCMD API for ${appId}`);
    
    return response?.data || null;
  } catch (error) {
    console.error(`[MANIFEST] Error fetching SteamCMD info for ${appId}:`, getErrorMessage(error, 'SteamCMD API'));
    return null;
  }
}

/**
 * Extract manifest IDs from SteamCMD depot data
 * Focuses on 'public' branch as it's the most used
 * Structure: depots.{depotId}.manifests.public.gid
 * @param {Object} steamData - Data from SteamCMD API
 * @returns {Object} Map of depot ID to manifest ID (gid)
 */
function extractManifestIds(steamData) {
  const manifestIds = {};
  
  if (!steamData?.depots) {
    return manifestIds;
  }
  
  for (const [depotId, depotData] of Object.entries(steamData.depots)) {
    // Skip non-numeric depot IDs (config entries like "1")
    if (isNaN(depotId)) continue;
    
    // Look for manifests in depot data - prioritize 'public' branch
    if (depotData?.manifests?.public?.gid) {
      manifestIds[depotId] = depotData.manifests.public.gid;
      console.log(`[MANIFEST] Found depot ${depotId}: manifest ${depotData.manifests.public.gid} (${depotData.manifests.public.size} bytes)`);
    }
  }
  
  return manifestIds;
}

/**
 * Check if a game needs manifest updates
 * @param {string} appId - The Steam App ID
 * @returns {Promise<Object>} Update status object
 */
export async function checkGameNeedsUpdate(appId) {
  const result = {
    hasUpdate: false,
    currentManifest: null,
    latestManifest: null,
    depotUpdates: {},
    error: null,
    manifestCount: 0
  };
  
  try {
    // Get current game data from database
    const db = await getDb();
    const gameData = await db.collection('games').findOne({ 
      $or: [
        { appid: parseInt(appId) },
        { appid: appId.toString() }
      ]
    });
    
    if (!gameData) {
      result.error = 'Game not found in database';
      return result;
    }
    
    // Get latest depot info from SteamCMD
    const steamData = await getSteamCmdInfo(appId);
    if (!steamData) {
      result.error = 'Failed to fetch latest manifest data from SteamCMD';
      return result;
    }
    
    // Extract latest manifest IDs from public branch
    const latestManifests = extractManifestIds(steamData);
    result.manifestCount = Object.keys(latestManifests).length;
    
    if (result.manifestCount === 0) {
      result.error = 'No public branch manifests found in SteamCMD data';
      return result;
    }
    
    // Compare with current manifests in database
    const currentManifests = gameData.manifests || {};
    let hasUpdates = false;
    
    for (const [depotId, latestManifestId] of Object.entries(latestManifests)) {
      const currentManifestId = currentManifests[depotId];
      
      if (!currentManifestId || currentManifestId !== latestManifestId) {
        hasUpdates = true;
        result.depotUpdates[depotId] = {
          current: currentManifestId || 'none',
          latest: latestManifestId
        };
      }
    }
    
    result.hasUpdate = hasUpdates;
    result.currentManifest = Object.keys(currentManifests).length > 0 ? currentManifests : null;
    result.latestManifest = latestManifests;
    
    console.log(`[MANIFEST] Update check for ${appId}: ${hasUpdates ? 'UPDATE AVAILABLE' : 'UP TO DATE'} (${result.manifestCount} depots)`);
    
    return result;
    
  } catch (error) {
    console.error(`[MANIFEST] Error checking updates for ${appId}:`, error);
    result.error = error.message;
    return result;
  }
}

/**
 * Update game manifests in database
 * @param {string} appId - The Steam App ID
 * @param {Object} manifestIds - Map of depot ID to manifest ID (gid)
 * @returns {Promise<boolean>} Success status
 */
async function updateGameManifests(appId, manifestIds) {
  try {
    const db = await getDb();
    
    const updateResult = await db.collection('games').updateOne(
      { 
        $or: [
          { appid: parseInt(appId) },
          { appid: appId.toString() }
        ]
      },
      {
        $set: {
          manifests: manifestIds,
          lastManifestUpdate: new Date(),
          manifestSource: 'steamcmd-api'
        }
      }
    );
    
    if (updateResult.matchedCount === 0) {
      console.log(`[MANIFEST] Game ${appId} not found in database for manifest update`);
      return false;
    }
    
    console.log(`[MANIFEST] Updated manifests for ${appId}:`, manifestIds);
    return true;
    
  } catch (error) {
    console.error(`[MANIFEST] Error updating manifests for ${appId}:`, error);
    return false;
  }
}

/**
 * Automatically check and update manifests when a game is requested
 * This runs when users use /gen command to provide up-to-date manifest info
 * @param {string} appId - The Steam App ID
 * @returns {Promise<Object>} Update result
 */
export async function autoUpdateOnRequest(appId) {
  const startTime = Date.now();
  
  try {
    console.log(`[MANIFEST] Auto-update check for ${appId}...`);
    
    // Check if update is needed
    const updateStatus = await checkGameNeedsUpdate(appId);
    
    if (updateStatus.error) {
      console.log(`[MANIFEST] Auto-update check failed for ${appId}: ${updateStatus.error}`);
      return { 
        updated: false, 
        error: updateStatus.error, 
        hasUpdate: false,
        performance: Date.now() - startTime
      };
    }
    
    if (!updateStatus.hasUpdate) {
      console.log(`[MANIFEST] No updates needed for ${appId} (${updateStatus.manifestCount} depots up-to-date)`);
      return { 
        updated: false, 
        hasUpdate: false, 
        current: true,
        manifestCount: updateStatus.manifestCount,
        performance: Date.now() - startTime
      };
    }
    
    // Update manifests in database
    const updateSuccess = await updateGameManifests(appId, updateStatus.latestManifest);
    
    const result = {
      updated: updateSuccess,
      hasUpdate: true,
      depotUpdates: updateStatus.depotUpdates,
      manifestCount: updateStatus.manifestCount,
      oldManifests: updateStatus.currentManifest,
      newManifests: updateStatus.latestManifest,
      performance: Date.now() - startTime
    };
    
    if (updateSuccess) {
      const updateCount = Object.keys(updateStatus.depotUpdates).length;
      console.log(`[MANIFEST] ✅ Auto-update completed for ${appId}: ${updateCount} depots updated in ${result.performance}ms`);
    } else {
      console.log(`[MANIFEST] ❌ Auto-update failed for ${appId}: database update failed`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`[MANIFEST] Auto-update error for ${appId}:`, error);
    return { 
      updated: false, 
      error: error.message, 
      hasUpdate: false,
      performance: Date.now() - startTime
    };
  }
}

/**
 * Get DLC depot information using base game ID
 * For DLC: depot ID usually matches the DLC App ID
 * Use base game ID to get depot info that includes DLC depots
 * @param {string} baseGameId - The base game App ID
 * @param {string} dlcAppId - The DLC App ID (usually same as depot ID)
 * @returns {Promise<Object|null>} DLC depot info or null
 */
export async function getDlcDepotInfo(baseGameId, dlcAppId) {
  try {
    console.log(`[MANIFEST] Getting DLC depot info: base=${baseGameId}, dlc=${dlcAppId}`);
    
    // Get base game depot info which includes DLC depots
    const steamData = await getSteamCmdInfo(baseGameId);
    
    if (!steamData?.depots) {
      console.log(`[MANIFEST] No depot data found for base game ${baseGameId}`);
      return null;
    }
    
    // Look for depot matching DLC App ID (depot ID usually = DLC App ID)
    const dlcDepot = steamData.depots[dlcAppId];
    
    if (dlcDepot?.manifests?.public?.gid) {
      const dlcInfo = {
        depotId: dlcAppId,
        manifestId: dlcDepot.manifests.public.gid, // This is the 'gid' field
        size: dlcDepot.manifests.public.size,
        download: dlcDepot.manifests.public.download,
        baseGameId: baseGameId,
        manifestFile: `${dlcAppId}_${dlcDepot.manifests.public.gid}.manifest`
      };
      
      console.log(`[MANIFEST] Found DLC depot ${dlcAppId}: manifest ${dlcInfo.manifestId}`);
      return dlcInfo;
    }
    
    console.log(`[MANIFEST] DLC depot ${dlcAppId} not found in base game ${baseGameId} depots`);
    return null;
  } catch (error) {
    console.error(`[MANIFEST] Error getting DLC depot info for ${dlcAppId}:`, error);
    return null;
  }
}

/**
 * Get update statistics for monitoring
 * @returns {Promise<Object>} Statistics object
 */
export async function getUpdateStats() {
  try {
    const db = await getDb();
    
    const totalGames = await db.collection('games').countDocuments();
    const gamesWithManifests = await db.collection('games').countDocuments({ 
      manifests: { $exists: true, $ne: {} } 
    });
    const recentlyUpdated = await db.collection('games').countDocuments({
      lastManifestUpdate: { 
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    });

    const apiKeyConfig = await db.collection('config').findOne({ _id: 'manifesthub-api' });
    const hasValidApiKey = apiKeyConfig && apiKeyConfig.apiKey && 
                          (!apiKeyConfig.expiresAt || new Date() < apiKeyConfig.expiresAt);

    return {
      totalGames,
      gamesWithManifests,
      recentlyUpdated,
      manifestCoverage: totalGames > 0 ? Math.round((gamesWithManifests / totalGames) * 100) : 0,
      manifestHubApiConfigured: hasValidApiKey,
      apiKeyExpiry: apiKeyConfig?.expiresAt ? apiKeyConfig.expiresAt.toISOString() : null,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    console.error('[MANIFEST] Failed to get update stats:', error);
    return { 
      error: 'Failed to get stats',
      errorMessage: error.message 
    };
  }
}