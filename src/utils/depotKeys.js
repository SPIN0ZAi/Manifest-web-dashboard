import fs from 'node:fs';
import path from 'node:path';

let depotKeysCache = null;

/**
 * Load depot keys from the JSON file
 * @returns {Object} The depot keys object
 */
async function loadDepotKeys() {
    if (depotKeysCache) {
        return depotKeysCache;
    }

    try {
        const keysPath = path.join(process.cwd(), 'keys', 'depotkeys.json');
        const data = await fs.promises.readFile(keysPath, 'utf8');
        depotKeysCache = JSON.parse(data);
        return depotKeysCache;
    } catch (error) {
        console.error('Error loading depot keys:', error);
        throw new Error('Failed to load depot keys. Make sure keys/depotkeys.json exists and is valid JSON.');
    }
}

/**
 * Get the key for a specific depot ID
 * @param {string} depotId The depot ID to look up
 * @returns {Promise<string|null>} The depot key if found, null otherwise
 */
export async function getDepotKey(depotId) {
    try {
        const depotKeys = await loadDepotKeys();
        return depotKeys[depotId] || null;
    } catch (error) {
        console.error(`Error getting key for depot ${depotId}:`, error);
        return null;
    }
}

/**
 * Check if a depot key exists
 * @param {string} depotId The depot ID to check
 * @returns {Promise<boolean>} True if the key exists, false otherwise
 */
export async function hasDepotKey(depotId) {
    try {
        const depotKeys = await loadDepotKeys();
        return depotId in depotKeys;
    } catch (error) {
        console.error(`Error checking key for depot ${depotId}:`, error);
        return false;
    }
} 