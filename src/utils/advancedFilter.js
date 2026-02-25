// src/utils/advancedFilter.js
import axios from 'axios';

// Steam Content Descriptor IDs for adult content
const ADULT_CONTENT_IDS = [1, 3, 4]; // Adult content, Sexual content, Nudity
const VIOLENCE_CONTENT_IDS = [2, 6, 7]; // Violence, Gore, etc.
const MILD_CONTENT_IDS = [5]; // Mild language, etc. (not filtered)

// Manifest Hub API configuration
const MANIFEST_HUB_BASE_URL = 'https://api.manifesthub1.filegear-sg.me';
let manifestHubApiKey = null;
let apiKeyExpiry = null;

/**
 * Advanced content filtering using Steam's built-in content descriptors
 * Much more efficient than AI-based filtering
 */
export async function checkContentDescriptors(appId) {
  try {
    const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: {
        appids: appId,
        cc: 'us',
        l: 'en'
      },
      timeout: 10000
    });

    const appData = response.data[appId];
    if (!appData || !appData.success) {
      return { filtered: false, reason: 'Steam API unavailable', adultContent: false };
    }

    const data = appData.data;
    const contentDescriptors = data.content_descriptors;

    if (!contentDescriptors || !contentDescriptors.ids) {
      return { filtered: false, reason: 'No content descriptors found', adultContent: false };
    }

    const descriptorIds = contentDescriptors.ids;
    const hasAdultContent = descriptorIds.some(id => ADULT_CONTENT_IDS.includes(id));
    const hasViolence = descriptorIds.some(id => VIOLENCE_CONTENT_IDS.includes(id));

    return {
      filtered: hasAdultContent,
      reason: hasAdultContent ? 'Adult content detected via Steam descriptors' : null,
      adultContent: hasAdultContent,
      violence: hasViolence,
      descriptorIds,
      notes: contentDescriptors.notes
    };
  } catch (error) {
    console.error(`Failed to check content descriptors for ${appId}:`, error);
    return { filtered: false, reason: 'API error', adultContent: false };
  }
}

/**
 * Get latest manifest ID from steamcmd.net API
 */
export async function getLatestManifestId(appId) {
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
    console.error(`Failed to get latest manifest for ${appId}:`, error);
    return null;
  }
}

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
      
      console.log('✅ Manifest Hub API key refreshed');
      return manifestHubApiKey;
    }
  } catch (error) {
    console.error('Failed to get Manifest Hub API key:', error);
  }

  return null;
}

/**
 * Get manifest details from Manifest Hub
 */
export async function getManifestDetails(depotId, manifestId) {
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
 * Check if manifest is outdated and needs update
 */
export async function checkManifestUpdate(appId, currentManifestId) {
  try {
    // Get latest manifest from steamcmd.net
    const latestInfo = await getLatestManifestId(appId);
    if (!latestInfo) {
      return { needsUpdate: false, reason: 'Could not fetch latest manifest info' };
    }

    // If manifest IDs don't match, update is needed
    if (latestInfo.manifestId !== currentManifestId) {
      return {
        needsUpdate: true,
        currentManifestId,
        latestManifestId: latestInfo.manifestId,
        depotId: latestInfo.depotId,
        buildId: latestInfo.buildId,
        timestamp: latestInfo.timestamp
      };
    }

    return { needsUpdate: false, reason: 'Manifest is up to date' };
  } catch (error) {
    console.error(`Failed to check manifest update for ${appId}:`, error);
    return { needsUpdate: false, reason: 'Error checking for updates' };
  }
}

/**
 * Auto-update manifest if needed
 */
export async function autoUpdateManifest(appId, currentManifestId) {
  try {
    const updateInfo = await checkManifestUpdate(appId, currentManifestId);
    
    if (!updateInfo.needsUpdate) {
      return { updated: false, reason: updateInfo.reason };
    }

    // Get manifest details from Manifest Hub
    const manifestDetails = await getManifestDetails(
      updateInfo.depotId, 
      updateInfo.latestManifestId
    );

    if (!manifestDetails) {
      return { updated: false, reason: 'Could not fetch manifest details' };
    }

    return {
      updated: true,
      oldManifestId: currentManifestId,
      newManifestId: updateInfo.latestManifestId,
      depotId: updateInfo.depotId,
      buildId: updateInfo.buildId,
      fileCount: manifestDetails.fileCount,
      size: manifestDetails.size,
      timestamp: manifestDetails.timestamp
    };
  } catch (error) {
    console.error(`Failed to auto-update manifest for ${appId}:`, error);
    return { updated: false, reason: 'Update failed' };
  }
}

/**
 * Enhanced game filtering with multiple strategies
 */
export async function advancedGameFilter(gameData, appId) {
  // Strategy 1: Check Steam content descriptors (primary)
  const descriptorCheck = await checkContentDescriptors(appId);
  
  if (descriptorCheck.filtered) {
    return {
      filtered: true,
      reason: descriptorCheck.reason,
      strategy: 'steam_descriptors',
      adultContent: descriptorCheck.adultContent,
      violence: descriptorCheck.violence,
      descriptorIds: descriptorCheck.descriptorIds
    };
  }

  // Strategy 2: Check tags (fallback)
  if (gameData.tags && Array.isArray(gameData.tags)) {
    const adultTags = [
      'hentai', 'nsfw', 'adult only', 'anime nudity', 'erotic', 
      'dating sim', 'visual novel', 'explicit sexual content',
      'hardcore', 'uncensored', 'sexual content', 'nudity'
    ];

    const hasAdultTag = gameData.tags.some(tag => 
      adultTags.some(adultTag => 
        tag.toLowerCase().includes(adultTag.toLowerCase())
      )
    );

    if (hasAdultTag) {
      return {
        filtered: true,
        reason: 'Adult content detected via tags',
        strategy: 'tag_analysis',
        adultContent: true
      };
    }
  }

  // Strategy 3: Check description keywords (fallback)
  const description = (gameData.short_description || gameData.detailed_description || '').toLowerCase();
  const adultKeywords = [
    'hentai', 'nsfw', 'adult', 'sexual', 'nudity', 'erotic', 
    'explicit', 'uncensored', 'dating sim', 'visual novel'
  ];

  const hasAdultKeyword = adultKeywords.some(keyword => 
    description.includes(keyword)
  );

  if (hasAdultKeyword) {
    return {
      filtered: true,
      reason: 'Adult content detected via description',
      strategy: 'keyword_analysis',
      adultContent: true
    };
  }

  return {
    filtered: false,
    reason: 'Game passed all filters',
    strategy: 'multi_layer_check'
  };
}

/**
 * Get comprehensive game info with advanced filtering
 */
export async function getAdvancedGameInfo(appId) {
  try {
    // Get Steam store data
    const steamResponse = await axios.get(`https://store.steampowered.com/api/appdetails`, {
      params: { appids: appId, cc: 'us', l: 'en' },
      timeout: 10000
    });

    const appData = steamResponse.data[appId];
    if (!appData || !appData.success) {
      return { error: 'Steam API unavailable' };
    }

    const gameData = appData.data;

    // Apply advanced filtering
    const filterResult = await advancedGameFilter(gameData, appId);

    // Get latest manifest info
    const manifestInfo = await getLatestManifestId(appId);

    return {
      appId: parseInt(appId),
      name: gameData.name,
      header_image: gameData.header_image,
      short_description: gameData.short_description,
      price: gameData.price_overview?.final_formatted || 'N/A',
      is_free: gameData.is_free || false,
      genres: gameData.genres || [],
      categories: gameData.categories || [],
      content_descriptors: gameData.content_descriptors,
      filterResult,
      manifestInfo,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to get advanced game info for ${appId}:`, error);
    return { error: 'Failed to fetch game information' };
  }
} 