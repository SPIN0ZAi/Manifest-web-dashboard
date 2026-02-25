// main bot file
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder, REST, Routes } from 'discord.js';
import fs from 'node:fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { t } from './utils/localization.js';
import { connectToDatabase, getDb, closeDatabase } from './utils/database.js';
import { handleRequestButton, isRequestButton } from './interactions/buttons.js';
import { startApiServer, stopApiServer } from './api/server.js';
import { scheduleAutoUpdates, stopAutoUpdates } from './utils/autoUpdater.js';
import { scheduleWeeklyHighlights, schedulePriceDropChecks, stopNotificationSchedulers } from './utils/notifications.js';
import { isCommandAllowed, getServerType, SERVER_TYPES } from './utils/serverManager.js';
import { setClient } from './utils/discordClient.js';
import { getCommandCooldown } from './config/commands.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

// Bot owner ID from environment (no more hardcoded typo)
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '';

// Whitelist of allowed server IDs from environment (comma-separated)
const ALLOWED_SERVER_IDS = (process.env.ALLOWED_SERVER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

// Always include safe guild in whitelist
const SAFE_GUILD_ID = process.env.SAFE_GUILD_ID || '';
if (SAFE_GUILD_ID && !ALLOWED_SERVER_IDS.includes(SAFE_GUILD_ID)) {
    ALLOWED_SERVER_IDS.push(SAFE_GUILD_ID);
}

client.cooldowns = new Collection();
client.commands = new Collection();

// --- Ready event ---
client.on('ready', () => {
    logger.success(`Logged in as ${client.user.tag}`);

    const guilds = client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ');
    logger.success(`Connected to ${client.guilds.cache.size} servers: ${guilds}`);

    logger.info(`Bot Info: ${client.user.tag} | ID: ${client.user.id} | Servers: ${client.guilds.cache.size} | Commands: ${client.commands.size}`);

    client.user.setActivity('🤖 the supermanifest bot | 🛡️ serving civilians & 🎁 providing 50K+ game files | 💖 made with love by my creator SB', {
        type: ActivityType.Playing
    });

    // Make Discord client available via module export (replaces global.discordClient)
    setClient(client);

    // Start schedulers
    logger.info('Starting schedulers...');
    scheduleAutoUpdates();
    scheduleWeeklyHighlights(client);
    schedulePriceDropChecks();
    logger.success('All schedulers started successfully');
});

// --- Command loading ---
async function loadCommands() {
    logger.info('Loading commands...');
    const commands = new Collection();
    const commandsData = [];
    const commandsPath = join(__dirname, 'commands');

    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = `file://${join(commandsPath, file)}`;
            logger.debug(`Loading command: ${file}`);
            const command = await import(filePath);

            if ('data' in command && 'execute' in command) {
                commands.set(command.data.name, command);
                commandsData.push(command.data.toJSON());
            } else {
                logger.warn(`Command at ${file} is missing required 'data' or 'execute' property`);
            }
        }
        logger.success(`Loaded ${commands.size} commands successfully`);
        return { commands, commandsData };
    } catch (error) {
        logger.error('Failed to load commands', error);
        return null;
    }
}

// --- Command deployment ---
async function deployCommands(commandsData) {
    if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
        logger.error('Missing required environment variables for command deployment: DISCORD_TOKEN or DISCORD_CLIENT_ID');
        return;
    }
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        logger.info(`Refreshing ${commandsData.length} application (/) commands...`);
        const data = await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commandsData },
        );
        logger.success(`Reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        logger.error('Failed to deploy commands', error);
    }
}

// --- Error logging to Discord channel ---
async function logErrorToChannel(interaction, error) {
    try {
        const db = await getDb();
        const settings = await db.collection('settings').findOne({ guildId: interaction.guildId });
        if (!settings?.logChannel) return;

        const channel = await interaction.client.channels.fetch(settings.logChannel);
        if (channel?.isTextBased()) {
            const { commandName, user, guild } = interaction;
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Error Occurred')
                .addFields(
                    { name: 'Command', value: `\`/${commandName}\``, inline: true },
                    { name: 'User', value: user.toString(), inline: true },
                    { name: 'Error', value: `\`\`\`${error.message.slice(0, 1000)}\`\`\`` }
                )
                .setTimestamp()
                .setFooter({ text: `Guild: ${guild.name}`, iconURL: guild.iconURL() });
            await channel.send({ embeds: [embed] });
        }
    } catch (e) {
        logger.error('Failed to send error log to channel', e);
    }
}

// --- Build "not authorized" embed ---
function buildBlockedEmbed(interaction) {
    return new EmbedBuilder()
        .setTitle('🚫 Server Not Authorized')
        .setColor(0xff0000)
        .setDescription('**This bot is restricted to specific servers only.**')
        .addFields([
            { name: '⚠️ Access Denied', value: '🔒 This server is **not authorized** to use this bot.', inline: false },
            { name: '📋 Why?', value: '🛡️ The bot owner has **restricted access** for **security and legal compliance** reasons.', inline: false },
            { name: '💡 What Can I Do?', value: '📧 **Contact the bot owner** to request authorization.', inline: false }
        ])
        .setFooter({ text: '🔐 Whitelist Protection Active', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

// --- Build "command not available" embed ---
function buildUnavailableEmbed(interaction) {
    return new EmbedBuilder()
        .setTitle('🚫 Command Not Available')
        .setColor(0xff6b6b)
        .setDescription('**This command is not available in this server.**')
        .addFields([
            { name: '⚠️ Current Status', value: '`🔒 Restricted Access Mode`', inline: false },
            { name: '📋 Info', value: '🛑 This command is restricted to authorized servers only.', inline: false },
            { name: '💡 Available Commands', value: '📊 Use `/status`, `/serverinfo`, or `/gensettings` (admins).', inline: false }
        ])
        .setFooter({ text: '🔐 Command restricted', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

// --- Interaction handler ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Check if server is in the whitelist
        if (ALLOWED_SERVER_IDS.length > 0 && !ALLOWED_SERVER_IDS.includes(interaction.guildId)) {
            return interaction.reply({ embeds: [buildBlockedEmbed(interaction)], ephemeral: true });
        }

        // Check if command is allowed in this server
        if (!isCommandAllowed(command.data.name, interaction.guildId)) {
            return interaction.reply({ embeds: [buildUnavailableEmbed(interaction)], ephemeral: true });
        }

        // Bot owner bypass: skip cooldowns
        if (interaction.user.id !== BOT_OWNER_ID) {
            // Cooldown logic
            const { cooldowns } = client;
            if (!cooldowns.has(command.data.name)) {
                cooldowns.set(command.data.name, new Collection());
            }
            const now = Date.now();
            const timestamps = cooldowns.get(command.data.name);
            const cooldownAmount = getCommandCooldown(command.data.name) * 1000;

            if (timestamps.has(interaction.user.id)) {
                const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
                if (now < expirationTime) {
                    const timeLeft = (expirationTime - now) / 1000;
                    const message = await t('COOLDOWN_MESSAGE', interaction.guildId, { time: timeLeft.toFixed(1), command: command.data.name });
                    return interaction.reply({ content: message, ephemeral: true });
                }
            }
            timestamps.set(interaction.user.id, now);
            setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
        }

        try {
            await command.execute(interaction);

            // Enhanced logging for /gen
            let logDetails = '';
            if (interaction.commandName === 'gen' && interaction._genLogInfo) {
                const { gameName, badTagCount, badTags, filterStatus } = interaction._genLogInfo;
                logDetails = ` | Game: "${gameName}" | Bad tags: ${badTagCount} [${badTags.join(', ')}] | Status: ${filterStatus}`;
            }
            logger.event(`User ${interaction.user.tag} used /${interaction.commandName}${logDetails}`);
        } catch (error) {
            logger.error(`Command execution error: /${interaction.commandName}`, error);
            await logErrorToChannel(interaction, error);

            const errorMessage = await t('ERROR_GENERIC', interaction.guildId);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch (replyError) {
                logger.error('Failed to send error reply to user', replyError);
            }
        }
    } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            logger.error(`Autocomplete error: /${interaction.commandName}`, error);
        }
    } else if (interaction.isButton()) {
        if (isRequestButton(interaction.customId)) {
            await handleRequestButton(interaction);
        }
    }
});

// --- Guild member update (premium role sync) ---
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        const db = await getDb();
        const settings = await db.collection('settings').findOne({ guildId: newMember.guild.id });
        const premiumRoleIds = settings?.premiumRoleIds || [];

        if (premiumRoleIds.length === 0) return;

        const oldHasRole = oldMember.roles.cache.some(role => premiumRoleIds.includes(role.id));
        const newHasRole = newMember.roles.cache.some(role => premiumRoleIds.includes(role.id));

        if (!oldHasRole && newHasRole) {
            logger.event(`User ${newMember.user.tag} granted premium via role.`);
            await db.collection('users').updateOne(
                { userId: newMember.id },
                { $set: { premium: true } },
                { upsert: true }
            );
        } else if (oldHasRole && !newHasRole) {
            logger.event(`User ${newMember.user.tag} premium revoked via role.`);
            await db.collection('users').updateOne(
                { userId: newMember.id },
                { $set: { premium: false } },
                { upsert: true }
            );
        }
    } catch (error) {
        logger.error('Error in guildMemberUpdate handler', error);
    }
});

// --- Guild join (setup message) ---
client.on('guildCreate', async (guild) => {
    try {
        const db = await getDb();
        const existing = await db.collection('settings').findOne({ guildId: guild.id });
        if (!existing) {
            await db.collection('settings').insertOne({
                guildId: guild.id,
                lang: 'en',
            });
            logger.success(`Initialized settings for new guild: ${guild.name} (${guild.id})`);
        }

        logger.success(`Joined new server: ${guild.name} (${guild.id}) | Now in ${client.guilds.cache.size} servers.`);

        // Find a suitable channel for the welcome message
        let targetChannel = null;
        const settings = await db.collection('settings').findOne({ guildId: guild.id });
        if (settings?.logChannel) {
            try { targetChannel = await guild.channels.fetch(settings.logChannel); } catch { /* ignore */ }
        }
        if (!targetChannel && guild.systemChannel) {
            targetChannel = guild.systemChannel;
        }
        if (!targetChannel) {
            const textChannels = guild.channels.cache.filter(c => c.type === 0 && c.viewable && c.permissionsFor(guild.members.me).has('SendMessages'));
            if (textChannels.size > 0) {
                targetChannel = textChannels.first();
            }
        }

        if (targetChannel) {
            await targetChannel.send({
                embeds: [{
                    title: '🚀 Welcome to SB Manifest Bot!',
                    color: 0x5865F2,
                    description: `Thank you for adding me to **${guild.name}**!\n\n**To get started, a server admin should:**\n` +
                        `1. **Check current status** with \`/serverinfo\`\n` +
                        `2. **Assign channels** using \`/gensettings setchannel\`\n` +
                        `3. **Set up roles** using \`/gensettings addpremiumrole\`, \`/gensettings addadminrole\`, \`/gensettings addmoderatorrole\`\n` +
                        `4. **Configure usage limits** with \`/gensettings setusagelimit\`\n` +
                        `5. **Set the alerts role** with \`/gensettings alerts-role\`\n\n` +
                        `> Only server admins can use the settings command.\n> Contact the bot owner for support.`,
                    footer: { text: 'SB Manifest Bot Setup' },
                    timestamp: new Date().toISOString()
                }]
            });
        } else {
            logger.warn(`Could not find a suitable channel in guild: ${guild.name}`);
        }
    } catch (e) {
        logger.error('Failed to initialize settings for new guild', e);
    }
});

// --- Graceful shutdown ---
async function handleShutdown(signal) {
    logger.warn(`Received ${signal}. Starting graceful shutdown...`);

    try {
        // Stop schedulers
        stopAutoUpdates();
        stopNotificationSchedulers();

        // Stop API server
        await stopApiServer();
        logger.success('API server stopped');

        // Close database
        await closeDatabase();
        logger.success('Database connection closed');

        // Destroy Discord client
        client.destroy();
        logger.success('Discord client destroyed');

        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Global error handlers
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', reason);
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
});

// --- Bot initialization ---
async function initializeBot() {
    logger.info('Initializing bot...');
    logger.info(`Whitelisted Server IDs: ${ALLOWED_SERVER_IDS.join(', ') || '(none — all servers allowed)'}`);

    const loadResult = await loadCommands();
    if (!loadResult) process.exit(1);

    client.commands = loadResult.commands;

    await deployCommands(loadResult.commandsData);

    logger.info('Connecting to database...');
    try {
        await connectToDatabase();
        logger.success('Connected to database successfully');
    } catch (error) {
        logger.error('Failed to connect to database', error);
        process.exit(1);
    }

    // Start API server AFTER database is ready
    startApiServer();

    try {
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        logger.error('Failed to log in', error);
        process.exit(1);
    }
}

initializeBot();