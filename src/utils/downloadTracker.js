// Download tracking and history management utility
import { getDb } from './database.js';

/**
 * Record a download in user's history
 */
export async function recordDownload(userId, appId, gameName, gameData = {}) {
    try {
        const db = await getDb();
        const now = new Date();
        
        // Extract additional game info
        const genres = gameData.genres?.map(g => g.description) || [];
        const size = gameData.fileSize || 0;
        const price = gameData.price_overview?.final_formatted || 'Free';
        
        await db.collection('download-history').updateOne(
            { userId, appId },
            {
                $set: {
                    gameName,
                    lastDownloaded: now,
                    genres,
                    size,
                    price,
                    headerImage: gameData.header_image
                },
                $inc: { downloadCount: 1 },
                $setOnInsert: {
                    firstDownloaded: now
                }
            },
            { upsert: true }
        );
        
        console.log(`Recorded download: ${gameName} (${appId}) for user ${userId}`);
        return true;
    } catch (error) {
        console.error('Error recording download:', error);
        return false;
    }
}

/**
 * Add/remove game from user's favorites
 */
export async function toggleFavorite(userId, appId, gameName, gameData = {}) {
    try {
        const db = await getDb();
        
        const existing = await db.collection('user-favorites')
            .findOne({ userId, appId });
        
        if (existing) {
            // Remove from favorites
            await db.collection('user-favorites')
                .deleteOne({ userId, appId });
            return { action: 'removed', success: true };
        } else {
            // Add to favorites
            await db.collection('user-favorites').insertOne({
                userId,
                appId,
                gameName,
                addedAt: new Date(),
                headerImage: gameData.header_image,
                genres: gameData.genres?.map(g => g.description) || []
            });
            return { action: 'added', success: true };
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if a game is in user's favorites
 */
export async function isFavorite(userId, appId) {
    try {
        const db = await getDb();
        const favorite = await db.collection('user-favorites')
            .findOne({ userId, appId });
        return !!favorite;
    } catch (error) {
        console.error('Error checking favorite status:', error);
        return false;
    }
}

/**
 * Get user's download statistics
 */
export async function getUserDownloadStats(userId) {
    try {
        const db = await getDb();
        
        const [stats] = await db.collection('download-history').aggregate([
            { $match: { userId } },
            {
                $group: {
                    _id: null,
                    totalDownloads: { $sum: '$downloadCount' },
                    uniqueGames: { $sum: 1 },
                    totalSize: { $sum: '$size' },
                    avgDownloadsPerGame: { $avg: '$downloadCount' }
                }
            }
        ]).toArray();
        
        const favoritesCount = await db.collection('user-favorites')
            .countDocuments({ userId });
        
        return {
            totalDownloads: stats?.totalDownloads || 0,
            uniqueGames: stats?.uniqueGames || 0,
            totalSize: stats?.totalSize || 0,
            avgDownloadsPerGame: stats?.avgDownloadsPerGame || 0,
            favoritesCount
        };
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

/**
 * Get user's recent downloads
 */
export async function getRecentDownloads(userId, limit = 5) {
    try {
        const db = await getDb();
        return await db.collection('download-history')
            .find({ userId })
            .sort({ lastDownloaded: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error('Error getting recent downloads:', error);
        return [];
    }
}

/**
 * Get user's favorites
 */
export async function getUserFavorites(userId, limit = 10) {
    try {
        const db = await getDb();
        return await db.collection('user-favorites')
            .find({ userId })
            .sort({ addedAt: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error('Error getting user favorites:', error);
        return [];
    }
}

/**
 * Clear user's download history
 */
export async function clearDownloadHistory(userId) {
    try {
        const db = await getDb();
        const result = await db.collection('download-history')
            .deleteMany({ userId });
        return result.deletedCount;
    } catch (error) {
        console.error('Error clearing download history:', error);
        return 0;
    }
}

/**
 * Export user's download data
 */
export async function exportUserData(userId) {
    try {
        const db = await getDb();
        
        const [downloads, favorites] = await Promise.all([
            db.collection('download-history')
                .find({ userId })
                .sort({ lastDownloaded: -1 })
                .toArray(),
            db.collection('user-favorites')
                .find({ userId })
                .sort({ addedAt: -1 })
                .toArray()
        ]);
        
        return {
            exportDate: new Date().toISOString(),
            userId,
            downloads: downloads.map(d => ({
                appId: d.appId,
                gameName: d.gameName,
                downloadCount: d.downloadCount,
                firstDownloaded: d.firstDownloaded,
                lastDownloaded: d.lastDownloaded,
                genres: d.genres
            })),
            favorites: favorites.map(f => ({
                appId: f.appId,
                gameName: f.gameName,
                addedAt: f.addedAt,
                genres: f.genres
            }))
        };
    } catch (error) {
        console.error('Error exporting user data:', error);
        return null;
    }
}