import type { SearchResult } from './types';

const STEAM_STORE_API = 'https://store.steampowered.com/api';

interface SteamAppDetailsResponse {
    [appId: string]: {
        success: boolean;
        data?: {
            type: string;
            name: string;
            steam_appid: number;
            is_free: boolean;
            short_description: string;
            header_image: string;
            genres?: { id: string; description: string }[];
            release_date?: { coming_soon: boolean; date: string };
            price_overview?: { final_formatted: string };
            dlc?: number[];
        };
    };
}

/**
 * Get Steam app details for a specific AppID
 */
export async function getSteamAppDetails(appId: string | number) {
    try {
        const res = await fetch(
            `${STEAM_STORE_API}/appdetails?appids=${appId}&l=english`,
            { next: { revalidate: 3600 } } // Cache for 1 hour
        );

        if (!res.ok) return null;
        const data: SteamAppDetailsResponse = await res.json();
        const entry = data[String(appId)];

        if (!entry?.success || !entry.data) return null;
        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Search Steam games by name
 */
export async function searchSteamGames(query: string): Promise<SearchResult[]> {
    try {
        // Use the Steam search suggest API
        const res = await fetch(
            `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=us`,
            { next: { revalidate: 300 } }
        );

        if (!res.ok) return [];
        const data = await res.json();

        if (!data.items) return [];

        return data.items.slice(0, 20).map(
            (item: { id: number; name: string; tiny_image: string; price?: { final?: number } }) => ({
                appId: item.id,
                name: item.name,
                headerImage: item.tiny_image?.replace('capsule_sm_120', 'header') ||
                    `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/header.jpg`,
                type: 'Game',
                isAvailable: true,
                isReleased: true,
                isFreeApp: item.price?.final === 0,
                price: item.price?.final
                    ? `$${(item.price.final / 100).toFixed(2)}`
                    : 'Free',
            })
        );
    } catch {
        return [];
    }
}

/**
 * Check if a game is released
 */
export async function checkGameRelease(appId: string | number): Promise<{
    isReleased: boolean;
    releaseDate: string;
    comingSoon: boolean;
}> {
    const details = await getSteamAppDetails(appId);
    if (!details) {
        return { isReleased: false, releaseDate: 'Unknown', comingSoon: false };
    }

    return {
        isReleased: !details.release_date?.coming_soon,
        releaseDate: details.release_date?.date || 'Unknown',
        comingSoon: details.release_date?.coming_soon || false,
    };
}
