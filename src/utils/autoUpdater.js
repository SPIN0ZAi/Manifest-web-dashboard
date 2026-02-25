// src/utils/autoUpdater.js
import axios from 'axios';
import { getDb } from './database.js';

// Auto-update configuration
const AUTO_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const MANIFEST_HUB_BASE_URL = 'https://api.manifesthub1.filegear-sg.me';
let manifestHubApiKey = null;
let apiKeyExpiry = null;

// Cache for auto-update status
const autoUpdateCache = new Map();

// Store scheduler IDs for cleanup
let initialTimeout = null;
let recurringInterval = null;

/**
 * Get or refresh Manifest Hub API key
 */
async function getManifestHubApiKey() {
  const now = Date.now();

  // Check if we have a valid API key
  if (manifestHubApiKey && apiKeyExpiry && now < apiKeyExpiry) {
    return manifestHubApiKey;
  }

  try {
    // Get new API key from Manifest Hub
    const response = await axios.get(`${MANIFEST_HUB_BASE_URL}/auth`, {
      timeout: 10000
    });

    if (response.data && response.data.api_key) {
      manifestHubApiKey = response.data.api_key;
      // Set expiry to 23 hours (slightly less than 24h to be safe)
      apiKeyExpiry = now + (23 * 60 * 60 * 1000);

      console.log('✅ Manifest Hub API key refreshed for auto-updater');
      return manifestHubApiKey;
    }
  } catch (error) {
    console.error('Failed to get Manifest Hub API key for auto-updater:', error);
  }

  return null;
}

/**
 * Get latest manifest info from steamcmd.net
 */
async function getLatestManifestInfo(appId) {
  try {
    const response = await axios.get(`https://api.steamcmd.net/v1/info/${appId}`, {
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return {
        manifestId: response.data.manifest_id,
        depotId: response.data.depot_id,
        buildId: response.data.build_id,
        timestamp: response.data.timestamp
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to get latest manifest info for ${appId}:`, error);
    return null;
  }
}

/**
 * Get manifest details from Manifest Hub
 */
async function getManifestDetails(depotId, manifestId) {
  try {
    const apiKey = await getManifestHubApiKey();
    if (!apiKey) {
      throw new Error('No Manifest Hub API key available');
    }

    const response = await axios.get(`${MANIFEST_HUB_BASE_URL}/manifest`, {
      params: {
        apikey: apiKey,
        depotid: depotId,
        manifestid: manifestId
      },
      timeout: 15000
    });

    if (response.data && response.data.success) {
      return {
        manifestId: response.data.manifest_id,
        depotId: response.data.depot_id,
        buildId: response.data.build_id,
        fileCount: response.data.file_count,
        size: response.data.size,
        timestamp: response.data.timestamp,
        isLatest: response.data.is_latest || false
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to get manifest details for ${depotId}/${manifestId}:`, error);
    return null;
  }
}

/**
 * Check if a manifest needs updating
 */
export async function checkManifestNeedsUpdate(appId, currentManifestId) {
  try {
    // Get latest manifest info
    const latestInfo = await getLatestManifestInfo(appId);
    if (!latestInfo) {
      return { needsUpdate: false, reason: 'Could not fetch latest manifest info' };
    }

    // Check if manifest IDs are different
    if (latestInfo.manifestId !== currentManifestId) {
      return {
        needsUpdate: true,
        currentManifestId,
        latestManifestId: latestInfo.manifestId,
        depotId: latestInfo.depotId,
        buildId: latestInfo.buildId,
        timestamp: latestInfo.timestamp,
        reason: 'New manifest available'
      };
    }

    return { needsUpdate: false, reason: 'Manifest is up to date' };
  } catch (error) {
    console.error(`Failed to check manifest update for ${appId}:`, error);
    return { needsUpdate: false, reason: 'Error checking for updates' };
  }
}

/**
 * Auto-update a manifest
 */
export async function autoUpdateManifest(appId, currentManifestId) {
  try {
    // Check if update is needed
    const updateCheck = await checkManifestNeedsUpdate(appId, currentManifestId);

    if (!updateCheck.needsUpdate) {
      return { updated: false, reason: updateCheck.reason };
    }

    // Get manifest details from Manifest Hub
    const manifestDetails = await getManifestDetails(
      updateCheck.depotId,
      updateCheck.latestManifestId
    );

    if (!manifestDetails) {
      return { updated: false, reason: 'Could not fetch manifest details' };
    }

    // Update database with new manifest info
    const db = await getDb();
    await db.collection('games').updateOne(
      { appId: appId.toString() },
      {
        $set: {
          manifestId: updateCheck.latestManifestId,
          buildId: updateCheck.buildId,
          lastUpdated: new Date(),
          autoUpdated: true
        }
      }
    );

    console.log(`✅ Auto-updated manifest for ${appId}: ${currentManifestId} → ${updateCheck.latestManifestId}`);

    return {
      updated: true,
      oldManifestId: currentManifestId,
      newManifestId: updateCheck.latestManifestId,
      depotId: updateCheck.depotId,
      buildId: updateCheck.buildId,
      fileCount: manifestDetails.fileCount,
      size: manifestDetails.size,
      timestamp: manifestDetails.timestamp,
      reason: 'Auto-updated successfully'
    };
  } catch (error) {
    console.error(`Failed to auto-update manifest for ${appId}:`, error);
    return { updated: false, reason: 'Auto-update failed' };
  }
}

/**
 * Batch auto-update all games in database
 */
export async function batchAutoUpdate() {
  try {
    const db = await getDb();
    const games = await db.collection('games').find({}).toArray();

    console.log(`🔄 Starting batch auto-update for ${games.length} games...`);

    let updatedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const game of games) {
      try {
        // Rate limiting: 1 request per second
        await new Promise(resolve => setTimeout(resolve, 1000));

        const result = await autoUpdateManifest(game.appId, game.manifestId);

        if (result.updated) {
          updatedCount++;
          results.push({
            appId: game.appId,
            name: game.name,
            oldManifest: result.oldManifestId,
            newManifest: result.newManifestId,
            buildId: result.buildId
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`Error updating ${game.appId}:`, error);
      }
    }

    console.log(`✅ Batch auto-update complete: ${updatedCount} updated, ${errorCount} errors`);

    return {
      totalGames: games.length,
      updatedCount,
      errorCount,
      results
    };
  } catch (error) {
    console.error('Failed to perform batch auto-update:', error);
    return { error: 'Batch update failed' };
  }
}

/**
 * Schedule auto-updates
 */
export function scheduleAutoUpdates() {
  console.log('🕐 Scheduling auto-updates every 6 hours...');

  // Run initial update after 1 minute
  initialTimeout = setTimeout(async () => {
    console.log('🚀 Running initial auto-update...');
    await batchAutoUpdate();
  }, 60 * 1000);

  // Schedule recurring updates
  recurringInterval = setInterval(async () => {
    console.log('🔄 Running scheduled auto-update...');
    await batchAutoUpdate();
  }, AUTO_UPDATE_INTERVAL);
}

/**
 * Stop auto-update schedulers (for graceful shutdown)
 */
export function stopAutoUpdates() {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (recurringInterval) {
    clearInterval(recurringInterval);
    recurringInterval = null;
  }
}

/**
 * Get auto-update status for a specific game
 */
export async function getAutoUpdateStatus(appId) {
  const cacheKey = `status_${appId}`;
  const now = Date.now();

  // Check cache first
  if (autoUpdateCache.has(cacheKey)) {
    const cached = autoUpdateCache.get(cacheKey);
    if (now - cached.timestamp < 5 * 60 * 1000) { // 5 minute cache
      return cached.data;
    }
  }

  try {
    const db = await getDb();
    const game = await db.collection('games').findOne({ appId: appId.toString() });

    if (!game) {
      return { error: 'Game not found in database' };
    }

    const updateCheck = await checkManifestNeedsUpdate(appId, game.manifestId);

    const status = {
      appId: game.appId,
      name: game.name,
      currentManifestId: game.manifestId,
      needsUpdate: updateCheck.needsUpdate,
      lastChecked: new Date().toISOString(),
      lastUpdated: game.lastUpdated,
      autoUpdated: game.autoUpdated || false
    };

    if (updateCheck.needsUpdate) {
      status.latestManifestId = updateCheck.latestManifestId;
      status.buildId = updateCheck.buildId;
      status.timestamp = updateCheck.timestamp;
    }

    // Cache the result
    autoUpdateCache.set(cacheKey, { data: status, timestamp: now });

    return status;
  } catch (error) {
    console.error(`Failed to get auto-update status for ${appId}:`, error);
    return { error: 'Failed to get status' };
  }
}

/**
 * Force update a specific game
 */
export async function forceUpdateGame(appId) {
  try {
    const db = await getDb();
    const game = await db.collection('games').findOne({ appId: appId.toString() });

    if (!game) {
      return { error: 'Game not found in database' };
    }

    const result = await autoUpdateManifest(appId, game.manifestId);

    if (result.updated) {
      // Clear cache for this game
      autoUpdateCache.delete(`status_${appId}`);
    }

    return result;
  } catch (error) {
    console.error(`Failed to force update ${appId}:`, error);
    return { error: 'Force update failed' };
  }
}

/**
 * Get auto-update statistics
 */
export async function getAutoUpdateStats() {
  try {
    const db = await getDb();

    const totalGames = await db.collection('games').countDocuments();
    const autoUpdatedGames = await db.collection('games').countDocuments({ autoUpdated: true });
    const recentlyUpdated = await db.collection('games').countDocuments({
      lastUpdated: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    return {
      totalGames,
      autoUpdatedGames,
      recentlyUpdated,
      autoUpdateEnabled: true,
      nextScheduledUpdate: new Date(Date.now() + AUTO_UPDATE_INTERVAL).toISOString()
    };
  } catch (error) {
    console.error('Failed to get auto-update stats:', error);
    return { error: 'Failed to get stats' };
  }
} 