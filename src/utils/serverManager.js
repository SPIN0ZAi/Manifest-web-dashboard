import { getDb } from './database.js';
import { SAFE_GUILD_ID, MAIN_GUILD_ID, EXCEPTION_GUILD_ID } from '../config/servers.js';
import { isCommandAllowedForServerType, getCommandsForServerType, getCommandCooldown } from '../config/commands.js';

// Server configuration constants
export const SERVER_TYPES = {
    MAIN: 'main',
    SAFE: 'safe',
    EXCEPTION: 'exception',
    REGULAR: 'regular'
};

// Re-export server IDs for backward compatibility
export { SAFE_GUILD_ID, MAIN_GUILD_ID, EXCEPTION_GUILD_ID };

/**
 * Get server type based on guild ID
 */
export function getServerType(guildId) {
    if (SAFE_GUILD_ID && guildId === SAFE_GUILD_ID) {
        return SERVER_TYPES.SAFE;
    } else if (MAIN_GUILD_ID && guildId === MAIN_GUILD_ID) {
        return SERVER_TYPES.MAIN;
    } else if (EXCEPTION_GUILD_ID && guildId === EXCEPTION_GUILD_ID) {
        return SERVER_TYPES.EXCEPTION;
    }
    return SERVER_TYPES.REGULAR;
}

/**
 * Check if a command is allowed in the current server.
 * Delegates to centralized command metadata in config/commands.js.
 */
export function isCommandAllowed(commandName, guildId) {
    const serverType = getServerType(guildId);
    return isCommandAllowedForServerType(commandName, serverType);
}

/**
 * Get available commands for a server type.
 * Delegates to centralized command metadata in config/commands.js.
 */
export function getAvailableCommands(serverType) {
    return getCommandsForServerType(serverType);
}

/**
 * Check if user has permission to use admin commands in a server
 */
export async function hasAdminPermission(userId, guildId, member) {
    const db = await getDb();
    const settings = await db.collection('settings').findOne({ guildId });

    if (!settings) return false;

    // Check admin roles
    const adminRoleIds = settings.adminRoleIds || [];
    const moderatorRoleIds = settings.moderatorRoleIds || [];

    return member.roles.cache.some(role =>
        adminRoleIds.includes(role.id) ||
        moderatorRoleIds.includes(role.id) ||
        member.permissions.has('Administrator')
    );
}

/**
 * Get server-specific settings
 */
export async function getServerSettings(guildId) {
    const db = await getDb();
    const settings = await db.collection('settings').findOne({ guildId });

    if (!settings) {
        // Create default settings for new server
        const defaultSettings = {
            guildId,
            lang: 'en',
            alertsChannel: null,
            logChannel: null,
            requestChannel: null,
            allowedChannelId: null,
            updatedGameChannel: null,
            alertsRole: null,
            premiumRoleIds: [],
            adminRoleIds: [],
            moderatorRoleIds: [],
            usageLimits: {}
        };

        await db.collection('settings').insertOne(defaultSettings);
        return defaultSettings;
    }

    return settings;
}

/**
 * Update server settings
 */
export async function updateServerSettings(guildId, updates) {
    const db = await getDb();
    await db.collection('settings').updateOne(
        { guildId },
        { $set: updates },
        { upsert: true }
    );
}

/**
 * Get all servers with alerts configured
 */
export async function getServersWithAlerts() {
    const db = await getDb();
    return db.collection('settings').find({
        alertsChannel: { $exists: true, $ne: null }
    }).toArray();
}

/**
 * Check if server has required channels configured
 */
export async function isServerConfigured(guildId) {
    const settings = await getServerSettings(guildId);
    return !!(settings.alertsChannel && settings.allowedChannelId);
}
