// Game recommendation system based on user history and preferences
import { getDb } from './database.js';
import { fetchSteamStoreInfo } from './gen.js';

/**
 * Get personalized game recommendations for a user
 */
export async function getPersonalizedRecommendations(userId, limit = 5) {
    try {
        const db = await getDb();
        
        // Get user's download history to analyze preferences
        const downloadHistory = await db.collection('download-history')
            .find({ userId })
            .sort({ lastDownloaded: -1 })
            .limit(20)
            .toArray();
        
        if (downloadHistory.length === 0) {
            return await getPopularGames(limit);
        }
        
        // Extract user's preferred genres
        const genreMap = new Map();
        downloadHistory.forEach(game => {
            game.genres?.forEach(genre => {
                genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
            });
        });
        
        // Get top genres
        const topGenres = Array.from(genreMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([genre]) => genre);
        
        // Find games in similar genres that user hasn't downloaded
        const downloadedAppIds = new Set(downloadHistory.map(game => game.appId));
        
        const recommendations = await db.collection('games')
            .find({
                appId: { $nin: Array.from(downloadedAppIds) },
                genres: { $in: topGenres },
                isAdultContent: { $ne: true }
            })
            .sort({ downloadCount: -1 })
            .limit(limit * 2)
            .toArray();
        
        // Score recommendations based on genre match
        const scoredRecommendations = recommendations.map(game => {
            let score = 0;
            game.genres?.forEach(genre => {
                const genreWeight = genreMap.get(genre) || 0;
                score += genreWeight;
            });
            return { ...game, score };
        });
        
        // Sort by score and return top results
        return scoredRecommendations
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
            
    } catch (error) {
        console.error('Error getting personalized recommendations:', error);
        return await getPopularGames(limit);
    }
}

/**
 * Get popular games as fallback recommendations
 */
export async function getPopularGames(limit = 5) {
    try {
        const db = await getDb();
        
        return await db.collection('games')
            .find({ isAdultContent: { $ne: true } })
            .sort({ downloadCount: -1 })
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error('Error getting popular games:', error);
        return [];
    }
}

/**
 * Get similar games based on a specific game
 */
export async function getSimilarGames(appId, limit = 5) {
    try {
        const db = await getDb();
        
        // Get the reference game
        const referenceGame = await db.collection('games').findOne({ appId });
        if (!referenceGame || !referenceGame.genres) {
            return await getPopularGames(limit);
        }
        
        // Find games with similar genres
        const similarGames = await db.collection('games')
            .find({
                appId: { $ne: appId },
                genres: { $in: referenceGame.genres },
                isAdultContent: { $ne: true }
            })
            .sort({ downloadCount: -1 })
            .limit(limit)
            .toArray();
        
        return similarGames;
    } catch (error) {
        console.error('Error getting similar games:', error);
        return [];
    }
}

/**
 * Get trending games (games with recent download spikes)
 */
export async function getTrendingGames(limit = 5) {
    try {
        const db = await getDb();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        // Get games with high recent download activity
        const trendingGames = await db.collection('download-history')
            .aggregate([
                {
                    $match: {
                        lastDownloaded: { $gte: sevenDaysAgo }
                    }
                },
                {
                    $group: {
                        _id: '$appId',
                        gameName: { $first: '$gameName' },
                        recentDownloads: { $sum: 1 },
                        genres: { $first: '$genres' },
                        headerImage: { $first: '$headerImage' }
                    }
                },
                {
                    $sort: { recentDownloads: -1 }
                },
                {
                    $limit: limit
                }
            ])
            .toArray();
        
        return trendingGames.map(game => ({
            appId: game._id,
            name: game.gameName,
            genres: game.genres,
            header_image: game.headerImage,
            trendScore: game.recentDownloads
        }));
    } catch (error) {
        console.error('Error getting trending games:', error);
        return [];
    }
}

/**
 * Get new releases that match user preferences
 */
export async function getNewReleases(userId, limit = 5) {
    try {
        const db = await getDb();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Get user's preferred genres if available
        let preferredGenres = [];
        if (userId) {
            const userHistory = await db.collection('download-history')
                .find({ userId })
                .limit(10)
                .toArray();
            
            const genreMap = new Map();
            userHistory.forEach(game => {
                game.genres?.forEach(genre => {
                    genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
                });
            });
            
            preferredGenres = Array.from(genreMap.keys()).slice(0, 5);
        }
        
        // Find recent releases
        const newReleases = await db.collection('games')
            .find({
                releaseDate: { $gte: thirtyDaysAgo },
                isAdultContent: { $ne: true },
                ...(preferredGenres.length > 0 && { genres: { $in: preferredGenres } })
            })
            .sort({ releaseDate: -1 })
            .limit(limit)
            .toArray();
        
        return newReleases;
    } catch (error) {
        console.error('Error getting new releases:', error);
        return [];
    }
}

/**
 * Get comprehensive recommendations for a user
 */
export async function getComprehensiveRecommendations(userId) {
    try {
        const [personalized, trending, newReleases] = await Promise.all([
            getPersonalizedRecommendations(userId, 3),
            getTrendingGames(3),
            getNewReleases(userId, 3)
        ]);
        
        return {
            personalized,
            trending,
            newReleases,
            totalCount: personalized.length + trending.length + newReleases.length
        };
    } catch (error) {
        console.error('Error getting comprehensive recommendations:', error);
        return {
            personalized: [],
            trending: [],
            newReleases: [],
            totalCount: 0
        };
    }
}