// Shared Discord client reference
// Replaces the `global.discordClient` anti-pattern with a module-level export.
// Import { getClient } from './discordClient.js' wherever you need the client.

let _client = null;

/**
 * Set the Discord client reference (called once during bot initialization)
 */
export function setClient(client) {
    _client = client;
}

/**
 * Get the Discord client reference
 * @returns {import('discord.js').Client | null}
 */
export function getClient() {
    return _client;
}
