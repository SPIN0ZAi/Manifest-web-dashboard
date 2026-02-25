import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import { resetUserUsage } from '../utils/usageTracker.js';
import { getServerType, SERVER_TYPES, hasAdminPermission } from '../utils/serverManager.js';

export const data = new SlashCommandBuilder()
    .setName('gensettings')
    .setDescription('Configure SB manifest settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
        subcommand
            .setName('alerts-role')
            .setDescription('Sets the role to be pinged for new game announcements.')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to ping for alerts. Leave blank to remove the role.')
                    .setRequired(false)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove-alerts-role')
            .setDescription('Removes the current alerts role completely.'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('setchannel')
            .setDescription('Set a channel for specific bot functionality.')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The channel to set.')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText))
            .addStringOption(option =>
                option.setName('type')
                    .setDescription('The type of channel to set.')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Alerts', value: 'alerts' },
                        { name: 'Logs', value: 'logs' },
                        { name: 'Requests', value: 'requests' },
                        { name: 'Bot Commands', value: 'bot' },
                        { name: 'Updated Games', value: 'updated' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('addpremiumrole')
            .setDescription('Adds a role that grants premium features.')
            .addRoleOption(option => option.setName('role').setDescription('The role to add.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('removepremiumrole')
            .setDescription('Removes a premium role.')
            .addRoleOption(option => option.setName('role').setDescription('The role to remove.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('setusagelimit')
            .setDescription('Set the daily command usage limit for a specific role.')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to set the limit for.')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Number of commands allowed per day (0 for unlimited).')
                    .setRequired(true)
                    .setMinValue(0)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('addadminrole')
            .setDescription('Adds an admin role for unlimited usage.')
            .addRoleOption(option => option.setName('role').setDescription('The admin role to add.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('removeadminrole')
            .setDescription('Removes an admin role.')
            .addRoleOption(option => option.setName('role').setDescription('The admin role to remove.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('addmoderatorrole')
            .setDescription('Adds a moderator role for unlimited usage.')
            .addRoleOption(option => option.setName('role').setDescription('The moderator role to add.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('removemoderatorrole')
            .setDescription('Removes a moderator role.')
            .addRoleOption(option => option.setName('role').setDescription('The moderator role to remove.').setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('resetusage')
            .setDescription('Reset a specific user\'s daily usage count (Owner only).')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription('The user whose usage to reset.')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('setbulklimit')
            .setDescription('Set bulk generation limit for a specific role.')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to configure bulk limits for.')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Maximum games in one bulk request (e.g., 10, 20)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(50)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('removebulklimit')
            .setDescription('Remove bulk limit for a specific role.')
            .addRoleOption(option =>
                option.setName('role')
                    .setDescription('The role to remove bulk limits from.')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('viewbulklimits')
            .setDescription('View all configured bulk limits for roles.'));

export async function execute(interaction) {
    const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '';
    const isOwner = interaction.user.id === BOT_OWNER_ID;
    const serverType = getServerType(interaction.guildId);
    const isSafeServer = serverType === SERVER_TYPES.SAFE;
    const isMainServer = serverType === SERVER_TYPES.MAIN;

    // Defer reply first to avoid interaction conflicts
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (err) {
        console.error('Failed to defer reply:', err);
        return;
    }

    // Check if user has admin permissions in this server
    const hasAdmin = await hasAdminPermission(interaction.user.id, interaction.guildId, interaction.member);

    // Only allow owner in safe server
    if (isSafeServer && !isOwner) {
        try {
            return await interaction.editReply({
                content: '❌ Only the bot owner can use this command in the safe server.'
            });
        } catch (err) {
            console.error('Failed to edit reply with safe server error:', err);
            return;
        }
    }

    // Only allow server admins or owner in other servers
    if (!isOwner && !hasAdmin) {
        try {
            return await interaction.editReply({
                content: '❌ Only server administrators can use this command.'
            });
        } catch (err) {
            console.error('Failed to edit reply with admin permission error:', err);
            return;
        }
    }

    const subcommand = interaction.options.getSubcommand();
    let db;
    try {
        db = await getDb();
    } catch (dbError) {
        console.error('Database connection error:', dbError);
        try {
            return await interaction.editReply({
                content: '❌ Database connection error. Please try again later.'
            });
        } catch (err) {
            console.error('Failed to reply with database error:', err);
            return;
        }
    }
    const guildId = interaction.guildId;

    const handleRoleUpdate = async (action, roleType) => {
        const role = interaction.options.getRole('role');
        const dbField = `${roleType}RoleIds`;
        const actionVerb = action === '$addToSet' ? 'added' : 'removed';
        const preposition = action === '$addToSet' ? 'to' : 'from';

        try {
            await db.collection('settings').updateOne(
                { guildId },
                { [action]: { [dbField]: role.id } },
                { upsert: true }
            );

            const embed = createSettingsEmbed(
                `Role ${actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1)}`,
                `${role.toString()} has been ${actionVerb} ${preposition} the list of ${roleType} roles.`
            );
            try {
                await interaction.editReply({ embeds: [embed] });
                return; // Exit after successful response
            } catch (err) {
                console.error('Failed to edit reply with role update:', err);
                return; // Exit on edit error
            }
        } catch (dbError) {
            console.error('Database error in handleRoleUpdate:', dbError);
            try {
                await interaction.editReply({
                    content: `❌ Database error occurred while updating ${roleType} role.`
                });
                return; // Exit after error response
            } catch (err) {
                console.error('Failed to reply with database error:', err);
                return; // Exit on edit error
            }
        }
    };

    try {
        switch (subcommand) {
            case 'alerts-role': {
                const role = interaction.options.getRole('role');
                let description;

                try {
                    if (role) {
                        const isEveryoneRole = role.id === interaction.guildId;
                        const roleToSave = isEveryoneRole ? 'everyone' : role.id;

                        // Use $set to ensure the role gets updated properly
                        await db.collection('settings').updateOne(
                            { guildId },
                            { $set: { alertsRole: roleToSave } },
                            { upsert: true }
                        );

                        description = `The ${role} role will now be pinged for new game alerts.`;
                    } else {
                        // If no role provided, remove the alerts role
                        await db.collection('settings').updateOne(
                            { guildId },
                            { $unset: { alertsRole: "" } }
                        );
                        description = 'The alerts role has been removed.';
                    }

                    const embed = createSettingsEmbed('Alerts Role Set', description);
                    try {
                        await interaction.editReply({ embeds: [embed] });
                        return; // Exit after successful response
                    } catch (err) {
                        console.error('Failed to edit reply with alerts role:', err);
                        return; // Exit on edit error
                    }
                } catch (dbError) {
                    console.error('Database error in alerts-role:', dbError);
                    try {
                        await interaction.editReply({
                            content: '❌ Database error occurred while setting alerts role.'
                        });
                        return; // Exit after error response
                    } catch (err) {
                        console.error('Failed to reply with database error:', err);
                        return; // Exit on edit error
                    }
                }
            }
            case 'remove-alerts-role': {
                try {
                    await db.collection('settings').updateOne({ guildId }, { $unset: { alertsRole: "" } });
                    const embed = createSettingsEmbed('Alerts Role Removed', 'The alerts role has been completely removed. No role will be pinged for new game announcements.');
                    try {
                        await interaction.editReply({ embeds: [embed] });
                        return; // Exit after successful response
                    } catch (err) {
                        console.error('Failed to edit reply with alerts role removal:', err);
                        return; // Exit on edit error
                    }
                } catch (dbError) {
                    console.error('Database error in remove-alerts-role:', dbError);
                    try {
                        await interaction.editReply({
                            content: '❌ Database error occurred while removing alerts role.'
                        });
                        return; // Exit after error response
                    } catch (err) {
                        console.error('Failed to reply with database error:', err);
                        return; // Exit on edit error
                    }
                }
            }
            case 'setchannel': {
                const channel = interaction.options.getChannel('channel');
                const type = interaction.options.getString('type');
                const fieldMap = {
                    alerts: 'alertsChannel',
                    logs: 'logChannel',
                    requests: 'requestChannel',
                    bot: 'allowedChannelId',
                    updated: 'updatedGameChannel'
                };
                try {
                    await db.collection('settings').updateOne(
                        { guildId },
                        { $set: { [fieldMap[type]]: channel.id } },
                        { upsert: true }
                    );
                    const embed = createSettingsEmbed(`${type.charAt(0).toUpperCase() + type.slice(1)} Channel Set`, `The ${type} channel has been set to ${channel}.`);
                    try {
                        await interaction.editReply({ embeds: [embed] });
                        return; // Exit after successful response
                    } catch (err) {
                        console.error('Failed to edit reply with channel set:', err);
                        return; // Exit on edit error
                    }
                } catch (dbError) {
                    console.error('Database error in setchannel:', dbError);
                    try {
                        await interaction.editReply({
                            content: '❌ Database error occurred while setting channel.'
                        });
                        return; // Exit after error response
                    } catch (err) {
                        console.error('Failed to reply with database error:', err);
                        return; // Exit on edit error
                    }
                }
            }
            case 'addpremiumrole':
                await handleRoleUpdate('$addToSet', 'premium');
                break;
            case 'removepremiumrole':
                await handleRoleUpdate('$pull', 'premium');
                break;
            case 'setusagelimit': {
                const role = interaction.options.getRole('role');
                const limit = interaction.options.getInteger('limit');
                const dbKey = `usageLimits.${role.id}`;

                try {
                    await db.collection('settings').updateOne(
                        { guildId },
                        { $set: { [dbKey]: { dailyLimit: limit } } },
                        { upsert: true }
                    );

                    const embed = createSettingsEmbed('Usage Limit Set',
                        `Users with the ${role} role now have a daily limit of ${limit === 0 ? 'unlimited' : limit} commands.`);
                    try {
                        await interaction.editReply({ embeds: [embed] });
                        return; // Exit after successful response
                    } catch (err) {
                        console.error('Failed to edit reply with usage limit:', err);
                        return; // Exit on edit error
                    }
                } catch (dbError) {
                    console.error('Database error in setusagelimit:', dbError);
                    try {
                        await interaction.editReply({
                            content: '❌ Database error occurred while setting usage limit.'
                        });
                        return; // Exit after error response
                    } catch (err) {
                        console.error('Failed to reply with database error:', err);
                        return; // Exit on edit error
                    }
                }
            }
            case 'addadminrole':
                await handleRoleUpdate('$addToSet', 'admin');
                break;
            case 'removeadminrole':
                await handleRoleUpdate('$pull', 'admin');
                break;
            case 'addmoderatorrole':
                await handleRoleUpdate('$addToSet', 'moderator');
                break;
            case 'removemoderatorrole':
                await handleRoleUpdate('$pull', 'moderator');
                break;
            case 'resetusage': {
                // Only owner can use resetusage
                if (!isOwner) {
                    return interaction.editReply({
                        content: '❌ Only the bot owner can reset user usage.',
                        ephemeral: true
                    });
                }
                const user = interaction.options.getUser('user');
                const success = await resetUserUsage(user.id, guildId);

                if (success) {
                    const embed = createSettingsEmbed('Usage Reset',
                        `The daily usage count for ${user} has been reset.`);
                    await interaction.editReply({ embeds: [embed] });
                    return; // Exit after successful response
                } else {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`${emojis.Error} Reset Failed`)
                        .setDescription('Failed to reset the user\'s usage count. Please try again.')
                        .setColor(0xFF0000)
                        .setTimestamp();
                    await interaction.editReply({ embeds: [errorEmbed] });
                    return; // Exit after error response
                }
            }

            case 'setbulklimit': {
                const role = interaction.options.getRole('role');
                const limit = interaction.options.getInteger('limit');

                await db.collection('settings').updateOne(
                    { guildId },
                    { $set: { [`bulkLimits.${role.id}`]: limit } },
                    { upsert: true }
                );

                const embed = createSettingsEmbed(
                    'Bulk Limit Set',
                    `✅ Members with the **${role.name}** role can now generate up to **${limit} games** in one bulk request.\n\n` +
                    `💡 Use \`/genbulk\` to test the new limit!`
                );
                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case 'removebulklimit': {
                const role = interaction.options.getRole('role');

                await db.collection('settings').updateOne(
                    { guildId },
                    { $unset: { [`bulkLimits.${role.id}`]: "" } }
                );

                const embed = createSettingsEmbed(
                    'Bulk Limit Removed',
                    `✅ Bulk limit removed for **${role.name}** role.\n\n` +
                    `They will now use the default limit (5 games).`
                );
                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case 'viewbulklimits': {
                const settings = await db.collection('settings').findOne({ guildId });
                const bulkLimits = settings?.bulkLimits || {};

                if (Object.keys(bulkLimits).length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle('📊 Bulk Generation Limits')
                        .setDescription('No custom bulk limits configured.\n\nDefault limit: **5 games** per bulk request.')
                        .setColor(0x5865F2)
                        .setTimestamp();
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    const guild = await interaction.client.guilds.fetch(guildId);
                    const limitsList = await Promise.all(
                        Object.entries(bulkLimits).map(async ([roleId, limit]) => {
                            try {
                                const role = await guild.roles.fetch(roleId);
                                return `• **${role.name}**: ${limit} games`;
                            } catch {
                                return `• <@&${roleId}>: ${limit} games (Role not found)`;
                            }
                        })
                    );

                    const embed = new EmbedBuilder()
                        .setTitle('📊 Bulk Generation Limits')
                        .setDescription(
                            '**Configured Role Limits:**\n' +
                            limitsList.join('\n') +
                            '\n\n**Default:** 5 games per bulk request'
                        )
                        .setColor(0x5865F2)
                        .setFooter({ text: 'Use /gensettings setbulklimit to modify' })
                        .setTimestamp();
                    await interaction.editReply({ embeds: [embed] });
                }
                break;
            }
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Error} Settings Update Failed`)
            .setDescription(error.message || 'An unexpected error occurred. Please try again later.')
            .setColor(0xFF0000)
            .setTimestamp();

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

function createSettingsEmbed(title, description, type = 'success') {
    const colors = {
        success: 0x57F287,
        warn: 0xFEE75C,
    };
    return new EmbedBuilder()
        .setTitle(`${emojis.Success} ${title}`)
        .setDescription(description)
        .setColor(colors[type])
        .setTimestamp();
} 