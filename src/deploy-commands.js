import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPublicCommandNames, getSensitiveCommandNames, isKnownCommand } from './config/commands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Safe guild ID from environment (where all commands including sensitive ones will be available)
const SAFE_GUILD_ID = process.env.SAFE_GUILD_ID;

if (!SAFE_GUILD_ID) {
    console.error('❌ SAFE_GUILD_ID environment variable is not set. Cannot deploy commands.');
    process.exit(1);
}

async function deployCommands() {
    console.log('Starting secure command deployment...');
    const publicCommands = [];
    const sensitiveCommands = [];
    const commandsPath = path.join(__dirname, 'commands');

    // Get command classifications from centralized config
    const publicCommandNames = getPublicCommandNames();
    const sensitiveCommandNames = getSensitiveCommandNames();

    try {
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        console.log('Found command files:', commandFiles);

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            console.log(`Loading command from ${file}...`);

            try {
                const command = await import(`file://${filePath}`);
                if ('data' in command) {
                    const commandName = command.data.name;
                    const commandData = command.data.toJSON();

                    if (publicCommandNames.includes(commandName)) {
                        publicCommands.push(commandData);
                        console.log(`✅ Loaded PUBLIC command: ${commandName}`);
                    } else if (sensitiveCommandNames.includes(commandName)) {
                        sensitiveCommands.push(commandData);
                        console.log(`🔒 Loaded SENSITIVE command: ${commandName}`);
                    } else {
                        // Unknown command — default to sensitive for safety
                        sensitiveCommands.push(commandData);
                        console.log(`⚠️ Loaded UNKNOWN command as SENSITIVE: ${commandName} (add it to config/commands.js)`);
                    }
                } else {
                    console.warn(`[WARNING] The command at ${filePath} is missing a required "data" property.`);
                }
            } catch (error) {
                console.error(`Error loading command ${file}:`, error);
            }
        }

        if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
            throw new Error('Missing required environment variables: DISCORD_TOKEN or DISCORD_CLIENT_ID');
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        console.log(`\n📊 Command Summary:`);
        console.log(`Public commands: ${publicCommands.length}`);
        console.log(`Sensitive commands: ${sensitiveCommands.length}`);
        console.log(`Safe guild ID: ${SAFE_GUILD_ID}\n`);

        // Deploy public commands globally (available in all servers)
        console.log('🌐 Deploying public commands globally...');
        const globalData = await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: publicCommands },
        );
        console.log(`✅ Successfully deployed ${globalData.length} public commands globally.`);

        // Deploy ALL commands (public + sensitive) to safe guild only
        console.log(`🔒 Deploying all commands to safe guild (${SAFE_GUILD_ID})...`);
        const allCommands = [...publicCommands, ...sensitiveCommands];
        const guildData = await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, SAFE_GUILD_ID),
            { body: allCommands },
        );
        console.log(`✅ Successfully deployed ${guildData.length} commands to safe guild.`);

        console.log('\n🎉 Secure command deployment completed!');
        console.log(`📋 Public commands available everywhere: ${publicCommands.map(c => c.name).join(', ')}`);
        console.log(`🔐 Sensitive commands available only in safe guild: ${sensitiveCommands.map(c => c.name).join(', ')}`);

    } catch (error) {
        console.error('Error deploying commands:', error);
        process.exit(1);
    }
}

// Run the deployment
deployCommands();