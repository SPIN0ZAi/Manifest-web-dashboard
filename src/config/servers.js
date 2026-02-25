// Server configuration file
// All server IDs are read from environment variables.

import 'dotenv/config';

export const SERVER_CONFIG = {
    // Safe Server - Where sensitive commands like upload work
    SAFE: {
        id: process.env.SAFE_GUILD_ID || '',
        name: 'Safe Server',
        type: 'safe'
    },

    // Exception Server - Special server with full user command access (including /gen)
    EXCEPTION: {
        id: process.env.EXCEPTION_GUILD_ID || '',
        name: 'Exception Server',
        type: 'exception'
    },

    // Main Server - Reserved for future use
    MAIN: {
        id: process.env.MAIN_GUILD_ID || '',
        name: 'Main Server',
        type: 'main'
    }
};

// Legacy constants for backward compatibility
export const SAFE_GUILD_ID = SERVER_CONFIG.SAFE.id;
export const MAIN_GUILD_ID = SERVER_CONFIG.MAIN.id;
export const EXCEPTION_GUILD_ID = SERVER_CONFIG.EXCEPTION.id;

// Helper function to get server info
export function getServerInfo(guildId) {
    for (const [key, server] of Object.entries(SERVER_CONFIG)) {
        if (server.id && server.id === guildId) {
            return server;
        }
    }
    return {
        id: guildId,
        name: 'Regular Server',
        type: 'regular'
    };
}
