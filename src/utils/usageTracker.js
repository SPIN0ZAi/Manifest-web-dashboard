import { getDb } from './database.js';

// Default limits if not set by admin
const DEFAULT_LIMITS = {
    default: 20,  // Default for regular users
    premium: 100  // Default for premium users
};

// Cache for user usage to reduce database calls
const usageCache = new Map();

// Clear cache at midnight UTC
function scheduleDailyReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    const timeUntilReset = tomorrow - now;

    setTimeout(() => {
        usageCache.clear();
        scheduleDailyReset(); // Schedule next reset
    }, timeUntilReset);
}

// Start the daily reset schedule
scheduleDailyReset();

export async function checkAndUpdateUsage(userId, guildId, interaction) {
    if (!interaction.guild) {
        return {
            error: true,
            message: "This command can only be used in a server (not in DMs or missing server context)."
        };
    }

    const db = await getDb();
    const settings = await db.collection('settings').findOne({ guildId });
    
    // Check if command is restricted to specific channel
    if (settings?.allowedChannelId && interaction.channelId !== settings.allowedChannelId) {
        return {
            error: true,
            message: `This command can only be used in <#${settings.allowedChannelId}>`
        };
    }

    // Get user's roles and find applicable limits
    const member = await interaction.guild.members.fetch(userId);
    const userRoles = Array.from(member.roles.cache.keys());
    
    const adminRoleIds = settings?.adminRoleIds || [];
    const moderatorRoleIds = settings?.moderatorRoleIds || [];
    const premiumRoleIds = settings?.premiumRoleIds || [];
    
    // Check if user has an admin or moderator role for unlimited usage
    const isAdmin = member.roles.cache.some(role => adminRoleIds.includes(role.id));
    const isModerator = member.roles.cache.some(role => moderatorRoleIds.includes(role.id));

    if (isAdmin || isModerator) {
        // Still track usage for statistics but don't enforce limits
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `${userId}-${guildId}-${today}`;
        let currentUsage = usageCache.get(cacheKey) || 0;
        currentUsage++;
        usageCache.set(cacheKey, currentUsage);
        
        await db.collection('usage').updateOne(
            {
                userId,
                guildId,
                date: today
            },
            {
                $inc: { count: 1 },
                $setOnInsert: { 
                    firstUsed: new Date(),
                    limit: Infinity,
                    isUnlimited: true
                }
            },
            { upsert: true }
        );

        return {
            currentUsage,
            limit: Infinity,
            isUnlimited: true
        };
    }
    
    // Find the highest limit among user's roles
    let highestLimit = DEFAULT_LIMITS.default; // Start with the base default
    if (settings?.usageLimits) {
        for (const roleId of userRoles) {
            const roleLimit = settings.usageLimits[roleId]?.dailyLimit;
            if (roleLimit !== undefined && roleLimit > highestLimit) {
                highestLimit = roleLimit;
            }
        }
    }

    // Check if user has a premium role for a potentially higher default
    const isPremium = member.roles.cache.some(role => premiumRoleIds.includes(role.id));
    if (isPremium) {
        highestLimit = Math.max(highestLimit, DEFAULT_LIMITS.premium);
    }

    // Get current usage from cache or database
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${userId}-${guildId}-${today}`;
    
    let currentUsage = usageCache.get(cacheKey);
    if (currentUsage === undefined) {
        const usageDoc = await db.collection('usage').findOne({
            userId,
            guildId,
            date: today
        });
        currentUsage = usageDoc?.count || 0;
        usageCache.set(cacheKey, currentUsage);
    }

    // Check if user has exceeded their limit
    if (currentUsage >= highestLimit) {
        return {
            error: true,
            message: `You have reached your daily limit of ${highestLimit} commands. Try again tomorrow!`
        };
    }

    // Update usage in both cache and database
    currentUsage++;
    usageCache.set(cacheKey, currentUsage);
    
    await db.collection('usage').updateOne(
        {
            userId,
            guildId,
            date: today
        },
        {
            $inc: { count: 1 },
            $setOnInsert: { 
                firstUsed: new Date(),
                limit: highestLimit
            }
        },
        { upsert: true }
    );

    return {
        currentUsage,
        limit: highestLimit
    };
}

/**
 * Reset a specific user's daily usage count
 * @param {string} userId The user ID to reset
 * @param {string} guildId The guild ID
 * @returns {Promise<boolean>} True if reset was successful
 */
export async function resetUserUsage(userId, guildId) {
    try {
        const db = await getDb();
        const today = new Date().toISOString().split('T')[0];
        
        // Remove from database
        await db.collection('usage').deleteOne({
            userId,
            guildId,
            date: today
        });
        
        // Remove from cache
        const cacheKey = `${userId}-${guildId}-${today}`;
        usageCache.delete(cacheKey);
        
        return true;
    } catch (error) {
        console.error('Error resetting user usage:', error);
        return false;
    }
} 