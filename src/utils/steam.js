// Steam API utility functions 

import axios from 'axios';

/**
 * Checks if a game exists on Steam and gets its release information
 * @param {string} appId The Steam AppID to check
 * @returns {Promise<object>} Object with game info and release status
 */
export async function checkGameReleaseStatus(appId) {
    if (!/^\d+$/.test(appId)) {
        throw new Error('Invalid AppID format. Please provide a numeric ID.');
    }

    try {
        const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: {
                appids: appId,
                cc: 'us',
                l: 'en'
            },
            timeout: 15000
        });

        const appData = response.data[appId];

        if (!appData || !appData.success) {
            return {
                exists: false,
                appId,
                name: null,
                releaseDate: null,
                isReleased: false,
                comingSoon: false
            };
        }

        const data = appData.data;
        const releaseDate = data.release_date;
        
        // Parse release date
        let isReleased = true;
        let comingSoon = false;
        let parsedDate = null;
        
        if (releaseDate) {
            comingSoon = releaseDate.coming_soon || false;
            
            if (releaseDate.date) {
                // Try to parse various date formats from Steam
                const dateStr = releaseDate.date;
                
                // Common Steam date formats:
                // "30 Sep, 2025"
                // "Sep 30, 2025"
                // "September 2025"
                // "Q4 2025"
                // "2025"
                // "Coming soon"
                // "TBA"
                
                if (dateStr.toLowerCase().includes('coming soon') || 
                    dateStr.toLowerCase().includes('tba') || 
                    dateStr.toLowerCase().includes('to be announced')) {
                    isReleased = false;
                    comingSoon = true;
                } else {
                    try {
                        // Try to parse the date
                        parsedDate = new Date(dateStr);
                        if (!isNaN(parsedDate.getTime())) {
                            const now = new Date();
                            isReleased = parsedDate <= now;
                            if (!isReleased) {
                                comingSoon = true;
                            }
                        }
                    } catch (e) {
                        // If we can't parse the date, check for year-only or quarter formats
                        const yearMatch = dateStr.match(/(\d{4})/);
                        if (yearMatch) {
                            const year = parseInt(yearMatch[1]);
                            const currentYear = new Date().getFullYear();
                            if (year > currentYear) {
                                isReleased = false;
                                comingSoon = true;
                            }
                        }
                    }
                }
            }
            
            // If Steam explicitly says coming_soon, trust that
            if (comingSoon) {
                isReleased = false;
            }
        }

        return {
            exists: true,
            appId,
            name: data.name,
            type: data.type,
            releaseDate: {
                raw: releaseDate?.date || null,
                parsed: parsedDate,
                comingSoon: comingSoon
            },
            isReleased,
            comingSoon,
            shortDescription: data.short_description,
            headerImage: data.header_image,
            price: data.price_overview,
            isFree: data.is_free
        };

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

/**
 * Searches for games by name using Steam's search API
 * @param {string} searchTerm The game name to search for
 * @returns {Promise<Array>} Array of search results
 */
export async function searchGamesByName(searchTerm) {
    try {
        // Use Steam's search API
        const response = await axios.get(`https://store.steampowered.com/api/storesearch/`, {
            params: {
                term: searchTerm,
                l: 'english',
                cc: 'US'
            },
            timeout: 10000
        });

        if (response.data && response.data.items) {
            return response.data.items.map(item => ({
                appId: item.id.toString(),
                name: item.name,
                type: item.type,
                price: item.price,
                releaseDate: item.release_date
            }));
        }

        return [];
    } catch (error) {
        console.error('Steam search API error:', error);
        return [];
    }
}

/**
 * Validates a Steam AppID and checks if it's a full game.
 * @param {string} appId The Steam AppID to validate.
 * @returns {Promise<object>} The game data object from the Steam API.
 * @throws {Error} If the AppID is invalid, not a game, or the request fails.
 */
export async function validateAppId(appId) {
    if (!/^\d+$/.test(appId)) {
        throw new Error('Invalid AppID format. Please provide a numeric ID.');
    }

    try {
        const response = await axios.get(`https://store.steampowered.com/api/appdetails`, {
            params: {
                appids: appId,
                cc: 'us', // Country code to get english results
                l: 'en'
            },
            timeout: 15000 // 15 second timeout
        });

        const appData = response.data[appId];

        if (!appData || !appData.success) {
            throw new Error(`No application found for AppID: ${appId}.`);
        }

        const data = appData.data;

        if (data.type !== 'game') {
            throw new Error(`AppID ${appId} is for a '${data.type}', not a full game. Please provide an AppID for a game.`);
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
        // Re-throw custom errors from the try block
        throw error;
    }
} 