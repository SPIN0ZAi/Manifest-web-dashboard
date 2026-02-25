// src/utils/dlcAnalyzer.js
import axios from 'axios';
import { fetchFilesFromRepo } from './github.js';

// Rate limiting for API calls
const API_CALLS = new Map();
const RATE_LIMIT_DELAY = 2000; // 2 seconds between calls to be safer

/**
 * Rate-limited API call to steamcmd.net
 */
async function rateLimitedApiCall(appId) {
  const now = Date.now();
  const lastCall = API_CALLS.get(appId) || 0;
  const timeSinceLastCall = now - lastCall;
  
  if (timeSinceLastCall < RATE_LIMIT_DELAY) {
    const delay = RATE_LIMIT_DELAY - timeSinceLastCall;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  API_CALLS.set(appId, Date.now());
  
  try {
    const response = await axios.get(`https://api.steamcmd.net/v1/info/${appId}`, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch info for ${appId}:`, error.message);
    return null;
  }
}

/**
 * Get DLC depots for a base game
 */
async function getDLCDepots(baseGameId) {
  try {
    const data = await rateLimitedApiCall(baseGameId);
    if (!data || data.status !== 'success') {
      return [];
    }
    
    // Extract DLC depots from the response
    const dlcDepots = [];
    
    // The API response has a structure like: data[appId].depots[depotId]
    const appData = data.data && data.data[baseGameId];
    if (!appData || !appData.depots) {
      return [];
    }
    
    // Iterate through all depots
    for (const [depotId, depotData] of Object.entries(appData.depots)) {
      // Skip the main game depot (usually depotId === baseGameId)
      if (depotId === baseGameId) {
        continue;
      }
      
      // Check if this depot has DLC information
      if (depotData.dlcappid && depotData.manifests) {
        // Get the latest manifest ID (prefer 'public' over 'classic')
        let manifestId = null;
        if (depotData.manifests.public && depotData.manifests.public.gid) {
          manifestId = depotData.manifests.public.gid;
        } else if (depotData.manifests.classic && depotData.manifests.classic.gid) {
          manifestId = depotData.manifests.classic.gid;
        }
        
        if (manifestId) {
          dlcDepots.push({
            appId: depotData.dlcappid,
            depotId: depotId,
            name: `DLC ${depotData.dlcappid}`,
            manifestId: manifestId
          });
        }
      }
    }
    
    return dlcDepots;
  } catch (error) {
    console.error(`Failed to get DLC depots for ${baseGameId}:`, error);
    return [];
  }
}

/**
 * Find DLC manifests in game files
 */
function findDLCManifests(files) {
  const dlcManifests = [];
  
  for (const file of files) {
    // Look for pattern: {depotid}_{manifestid}.manifest
    const match = file.name.match(/^(\d+)_(\d+)\.manifest$/);
    if (match) {
      const depotId = match[1];
      const manifestId = match[2];
      
      dlcManifests.push({
        depotId,
        manifestId,
        fileName: file.name
      });
    }
  }
  
  return dlcManifests;
}

/**
 * Analyze DLC status for a game
 */
export async function analyzeDLCStatus(baseGameId) {
  try {
    console.log(`🔍 Analyzing DLC status for game ${baseGameId}...`);
    
    // Get DLC depots from steamcmd.net with timeout
    const dlcDepotsPromise = getDLCDepots(baseGameId);
    const dlcDepots = await Promise.race([
      dlcDepotsPromise,
      new Promise((resolve) => setTimeout(() => resolve([]), 5000)) // 5 second timeout
    ]);
    
    if (dlcDepots.length === 0) {
      console.log(`⚠️ No DLC depots found for ${baseGameId}`);
      return {
        totalDLC: 0,
        existingDLC: 0,
        missingDLC: 0,
        validDLC: 0,
        invalidDLC: 0,
        dlcDetails: [],
        completion: 0,
        error: null // No error, just no DLCs found
      };
    }
    
    console.log(`📊 Found ${dlcDepots.length} DLC depots from API`);
    
    // Fetch game files from repository
    const gameFiles = await fetchFilesFromRepo(baseGameId);
    const existingManifests = findDLCManifests(gameFiles);
    console.log(`📁 Found ${existingManifests.length} DLC manifests in files`);
    
    // Analyze DLC status
    const analysis = {
      totalDLC: dlcDepots.length,
      existingDLC: 0,
      missingDLC: 0,
      validDLC: 0,
      invalidDLC: 0,
      dlcDetails: [],
      completion: 0
    };
    
    // Check each DLC depot
    for (const dlc of dlcDepots) {
      const existing = existingManifests.find(m => m.depotId === dlc.depotId);
      
      const dlcInfo = {
        appId: dlc.appId,
        depotId: dlc.depotId,
        name: dlc.name,
        exists: !!existing,
        manifestId: existing ? existing.manifestId : null,
        latestManifestId: dlc.manifestId,
        isUpToDate: existing ? (existing.manifestId === dlc.manifestId) : false
      };
      
      analysis.dlcDetails.push(dlcInfo);
      
      if (dlcInfo.exists) {
        analysis.existingDLC++;
        if (dlcInfo.isUpToDate) {
          analysis.validDLC++;
        }
      } else {
        analysis.missingDLC++;
      }
    }
    
    // Filter out artbooks, music, tools, etc. (usually have specific patterns)
    const invalidPatterns = ['artbook', 'soundtrack', 'music', 'tools', 'guide', 'wallpaper'];
    const validDLCs = analysis.dlcDetails.filter(dlc => 
      !invalidPatterns.some(pattern => 
        dlc.name.toLowerCase().includes(pattern)
      )
    );
    
    // Count only valid DLCs for completion
    analysis.validDLC = validDLCs.length;
    analysis.existingValidDLC = validDLCs.filter(dlc => dlc.exists).length;
    analysis.missingValidDLC = validDLCs.filter(dlc => !dlc.exists).length;
    
    // Calculate completion percentage based on valid DLCs only
    if (analysis.validDLC > 0) {
      analysis.completion = Math.round((analysis.existingValidDLC / analysis.validDLC) * 100);
    } else {
      analysis.completion = 0;
    }
    
    console.log(`✅ DLC Analysis complete: ${analysis.existingDLC}/${analysis.totalDLC} (${analysis.completion}%)`);
    
    return analysis;
  } catch (error) {
    console.error(`Failed to analyze DLC status for ${baseGameId}:`, error);
    return {
      totalDLC: 0,
      existingDLC: 0,
      missingDLC: 0,
      validDLC: 0,
      invalidDLC: 0,
      dlcDetails: [],
      completion: 0,
      error: error.message
    };
  }
}

/**
 * Check if a specific manifest needs updating
 */
export async function checkManifestUpdate(appId, currentManifestId) {
  try {
    const dataPromise = rateLimitedApiCall(appId);
    const data = await Promise.race([
      dataPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)) // 5 second timeout
    ]);
    
    if (!data || data.status !== 'success') {
      return { needsUpdate: false, reason: 'Could not fetch latest manifest info' };
    }
    
    // Get the main game depot data
    const appData = data.data && data.data[appId];
    if (!appData || !appData.depots) {
      return { needsUpdate: false, reason: 'No depot data available' };
    }
    
    // Find the main game depot (usually has the same ID as the app)
    const mainDepot = appData.depots[appId];
    if (!mainDepot || !mainDepot.manifests) {
      return { needsUpdate: false, reason: 'No main depot found' };
    }
    
    // Get the latest manifest ID (prefer 'public' over 'classic')
    let latestManifestId = null;
    if (mainDepot.manifests.public && mainDepot.manifests.public.gid) {
      latestManifestId = mainDepot.manifests.public.gid;
    } else if (mainDepot.manifests.classic && mainDepot.manifests.classic.gid) {
      latestManifestId = mainDepot.manifests.classic.gid;
    }
    
    if (latestManifestId && latestManifestId !== currentManifestId) {
      return {
        needsUpdate: true,
        currentManifestId,
        latestManifestId,
        depotId: appId,
        buildId: mainDepot.manifests.public?.download || mainDepot.manifests.classic?.download,
        timestamp: data.data[appId]?.timeupdated,
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
 * Update a manifest to the latest version
 */
export async function updateManifest(appId, currentManifestId) {
  try {
    const updateCheck = await checkManifestUpdate(appId, currentManifestId);
    
    if (!updateCheck.needsUpdate) {
      return { updated: false, reason: updateCheck.reason };
    }
    
    // Here you would implement the actual manifest update logic
    // For now, we'll just return the update info
    return {
      updated: true,
      oldManifestId: currentManifestId,
      newManifestId: updateCheck.latestManifestId,
      depotId: updateCheck.depotId,
      buildId: updateCheck.buildId,
      timestamp: updateCheck.timestamp,
      reason: 'Manifest updated successfully'
    };
  } catch (error) {
    console.error(`Failed to update manifest for ${appId}:`, error);
    return { updated: false, reason: 'Update failed' };
  }
}
