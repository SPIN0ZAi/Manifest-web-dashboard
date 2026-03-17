// Centralized command metadata — single source of truth
// All command permissions, types, and cooldowns are defined here.

/**
 * Command access levels:
 * - 'global'    → Available in ALL servers
 * - 'user'      → Available in safe + exception servers (user-facing commands)
 * - 'admin'     → Available ONLY in safe server (owner/admin-only)
 */

export const COMMAND_METADATA = {
    // === Global commands (available everywhere) ===
    'serverinfo': { access: 'global', cooldown: 5, description: 'View server configuration' },
    'gensettings': { access: 'global', cooldown: 3, description: 'Configure bot settings (admins only)' },
    'status': { access: 'global', cooldown: 5, description: 'Check current service status' },

    // === User commands (safe + exception servers) ===
    'gen': { access: 'user', cooldown: 5, description: 'Generate game files' },
    'genbulk': { access: 'user', cooldown: 10, description: 'Bulk generate game files' },
    'gendlc': { access: 'user', cooldown: 5, description: 'Generate DLC files' },
    'stats': { access: 'user', cooldown: 5, description: 'View bot statistics' },
    'checkgame': { access: 'user', cooldown: 3, description: 'Check game availability' },
    'suggestgame': { access: 'user', cooldown: 10, description: 'Suggest a game to add' },
    'mydownloads': { access: 'user', cooldown: 5, description: 'View your download history' },
    'gameinfo': { access: 'user', cooldown: 3, description: 'Get game information' },
    'profile': { access: 'user', cooldown: 5, description: 'View your profile' },
    'recommendations': { access: 'user', cooldown: 5, description: 'Get game recommendations' },
    'notifications': { access: 'user', cooldown: 3, description: 'Manage notifications' },
    'quick': { access: 'user', cooldown: 3, description: 'Quick game lookup' },
    'manifeststats': { access: 'user', cooldown: 5, description: 'View manifest statistics' },
    'admin': { access: 'user', cooldown: 3, description: 'Admin panel' },
    'add-collection': { access: 'user', cooldown: 5, description: 'Add a game collection' },
    'language': { access: 'user', cooldown: 3, description: 'Change bot language' },
    'notify-release': { access: 'user', cooldown: 5, description: 'Get notified on game release' },

    // === Admin-only commands (safe server only) ===
    'upload': { access: 'admin', cooldown: 10, description: 'Upload game files' },
    'uploadzip': { access: 'admin', cooldown: 10, description: 'Upload ZIP archive' },
    'uploadzipbulk': { access: 'admin', cooldown: 10, description: 'Bulk upload ZIP archives' },
    'announce': { access: 'admin', cooldown: 10, description: 'Send announcement' },
    'apikey': { access: 'admin', cooldown: 5, description: 'Manage API keys' },
    'setapikey': { access: 'admin', cooldown: 5, description: 'Set API key' },
    'autoupdate': { access: 'admin', cooldown: 5, description: 'Manage auto-updates' },
    'check-branches': { access: 'admin', cooldown: 5, description: 'Check repository branches' },
    'clearcache': { access: 'admin', cooldown: 5, description: 'Clear bot caches' },
    'refresh': { access: 'admin', cooldown: 5, description: 'Refresh bot data' },
    'send': { access: 'admin', cooldown: 5, description: 'Send message via bot' },
    'whitelistgame': { access: 'admin', cooldown: 5, description: 'Whitelist a game' },
    'serverdebug': { access: 'admin', cooldown: 5, description: 'Debug server info' },
};

/**
 * Get commands filtered by access level
 */
export function getCommandsByAccess(access) {
    return Object.entries(COMMAND_METADATA)
        .filter(([, meta]) => meta.access === access)
        .map(([name]) => name);
}

/**
 * Get the default cooldown for a command (in seconds)
 */
export function getCommandCooldown(commandName) {
    return COMMAND_METADATA[commandName]?.cooldown ?? 3;
}

/**
 * Check if a command name exists in our metadata
 */
export function isKnownCommand(commandName) {
    return commandName in COMMAND_METADATA;
}

/**
 * Get the access level of a command
 */
export function getCommandAccess(commandName) {
    return COMMAND_METADATA[commandName]?.access ?? 'admin';
}

/**
 * Get all command names for a specific server type
 */
export function getCommandsForServerType(serverType) {
    switch (serverType) {
        case 'safe':
            // Safe server gets everything
            return Object.keys(COMMAND_METADATA);
        case 'exception':
            // Exception server gets global + user commands
            return Object.entries(COMMAND_METADATA)
                .filter(([, meta]) => meta.access === 'global' || meta.access === 'user')
                .map(([name]) => name);
        case 'main':
        case 'regular':
        default:
            // Only global commands
            return getCommandsByAccess('global');
    }
}

/**
 * Check if a command is allowed in a given server type
 */
export function isCommandAllowedForServerType(commandName, serverType) {
    const meta = COMMAND_METADATA[commandName];
    if (!meta) return false;

    switch (serverType) {
        case 'safe':
            return true;
        case 'exception':
            return meta.access === 'global' || meta.access === 'user';
        case 'main':
        case 'regular':
        default:
            return meta.access === 'global';
    }
}

/**
 * For deploy-commands.js — classify commands as public vs sensitive
 * Public = global commands (deployed globally)
 * Sensitive = everything else (deployed to safe guild only)
 */
export function getPublicCommandNames() {
    return getCommandsByAccess('global');
}

export function getSensitiveCommandNames() {
    return Object.entries(COMMAND_METADATA)
        .filter(([, meta]) => meta.access !== 'global')
        .map(([name]) => name);
}
