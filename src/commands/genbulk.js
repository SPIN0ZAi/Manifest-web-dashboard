import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import { validateAppId } from '../utils/steam.js';
import { fetchFilesFromRepo } from '../utils/github.js';
import { createZipArchive } from '../utils/zip.js';
import { uploadFile } from '../utils/uploader.js';
import { t } from '../utils/localization.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import { checkAndUpdateUsage } from '../utils/usageTracker.js';

export const data = new SlashCommandBuilder()
    .setName('genbulk')
    .setDescription('Premium: Download multiple game files at once')
    .addStringOption(option =>
        option.setName('appids')
            .setDescription('Comma-separated list of Steam AppIDs (e.g., "730,570,440")')
            .setRequired(true)
            .setMaxLength(100));

async function validateUserPremium(interaction, userId, guildId) {
    const db = await getDb();
    const settings = await db.collection('settings').findOne({ guildId });
    
    const guild = await interaction.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);

    // Check if user has admin or moderator role
    if ((settings?.adminRoleId && member.roles.cache.has(settings.adminRoleId)) ||
        (settings?.moderatorRoleId && member.roles.cache.has(settings.moderatorRoleId))) {
        return; // Allow access for admins and moderators
    }

    // Check premium role for other users
    if (!settings?.premiumRoleId) {
        throw new Error(`${emojis.Error} Premium role is not configured for this server. Ask an admin to set it up.`);
    }
    
    if (!member.roles.cache.has(settings.premiumRoleId)) {
        throw new Error(`${emojis.Error} This command is only available to premium users.`);
    }
}

export async function execute(interaction) {
    try {
        // Validate premium status first
        const usage = await checkAndUpdateUsage(interaction.user.id, interaction.guildId, interaction);
        
        // Handle usage check errors
        if (usage.error) {
            await interaction.reply({ 
                content: usage.message,
                ephemeral: true 
            });
            return;
        }

        const appIds = interaction.options.getString('appids')
            .split(',')
            .map(id => id.trim())
            .filter(id => /^\d+$/.test(id));

        if (appIds.length === 0) {
            await interaction.reply({ 
                content: `${emojis.Error} Please provide valid Steam AppIDs (numbers only, comma-separated).`, 
                ephemeral: true 
            });
            return;
        }

        // Get user's bulk limit based on their roles
        const db = await getDb();
        const settings = await db.collection('settings').findOne({ guildId: interaction.guildId });
        const guild = await interaction.client.guilds.fetch(interaction.guildId);
        const member = await guild.members.fetch(interaction.user.id);
        
        // Check for role-based bulk limits
        let userBulkLimit = 5; // Default limit
        const bulkLimits = settings?.bulkLimits || {};
        
        // Check if user has admin/moderator role (unlimited)
        const isAdmin = (settings?.adminRoleIds || []).some(roleId => member.roles.cache.has(roleId));
        const isModerator = (settings?.moderatorRoleIds || []).some(roleId => member.roles.cache.has(roleId));
        
        if (isAdmin || isModerator) {
            userBulkLimit = 50; // Admin/Mod get highest limit
        } else {
            // Find the highest bulk limit from user's roles
            for (const [roleId, limit] of Object.entries(bulkLimits)) {
                if (member.roles.cache.has(roleId) && limit > userBulkLimit) {
                    userBulkLimit = limit;
                }
            }
        }

        if (appIds.length > userBulkLimit) {
            await interaction.reply({ 
                content: `${emojis.Error} You can only download up to **${userBulkLimit} games** at once with your current roles.\n\n` +
                         `💡 Ask an admin about bulk limit roles for higher limits!`, 
                ephemeral: true 
            });
            return;
        }

        await interaction.deferReply();

        // Validate all AppIDs and get game info
        const gameDataPromises = appIds.map(appId => validateAppId(appId));
        const gameDataResults = await Promise.allSettled(gameDataPromises);
        
        const validGames = gameDataResults
            .map((result, index) => ({ 
                appId: appIds[index], 
                data: result.status === 'fulfilled' ? result.value : null 
            }))
            .filter(game => game.data !== null);

        if (validGames.length === 0) {
            throw new Error(`${emojis.Error} None of the provided AppIDs are valid games.`);
        }

        // Create a safe combined filename
        const firstGame = validGames[0].data.name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const otherCount = validGames.length - 1;
        const zipFileName = `${firstGame}-and-${otherCount}-more-games.zip`;

        // Fetch files for all valid games
        const fetchingEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('BULK_DOWNLOAD_TITLE', interaction.guildId)}`)
            .setDescription(`${emojis.Load} ${await t('BULK_DOWNLOAD_FETCHING', interaction.guildId, { count: validGames.length })}`)
            .setColor(0x00FF00);
        await interaction.editReply({ embeds: [fetchingEmbed] });

        const allFilesPromises = validGames.map(game => fetchFilesFromRepo(game.appId));
        const allFilesResults = await Promise.allSettled(allFilesPromises);

        const allFiles = allFilesResults
            .map((result, index) => ({
                game: validGames[index],
                files: result.status === 'fulfilled' ? result.value : []
            }))
            .filter(result => result.files.length > 0);

        if (allFiles.length === 0) {
            throw new Error(`${emojis.Error} Could not find files for any of the provided games.`);
        }

        // Create ZIP with all files
        const zippingEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('BULK_DOWNLOAD_TITLE', interaction.guildId)}`)
            .setDescription(`${emojis.Load} ${await t('BULK_DOWNLOAD_COMPRESSING', interaction.guildId, { count: allFiles.length })}`)
            .setColor(0x00FF00);
        await interaction.editReply({ embeds: [zippingEmbed] });

        const zipBuffer = await createZipArchive(allFiles.flatMap(result => result.files));
        const zipSizeMB = zipBuffer.length / (1024 * 1024);

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('BULK_DOWNLOAD_SUCCESS', interaction.guildId)}`)
            .setColor(0x57F287)
            .addFields(
                { 
                    name: `${emojis.File_Size} Games Included`, 
                    value: validGames.map(game => `${game.data.name} (${game.appId})`).join('\n'),
                    inline: false 
                },
                { 
                    name: `${emojis.Usage} Statistics`, 
                    value: [
                        `Total Size: ${zipSizeMB.toFixed(2)} MB`,
                        `Games: ${validGames.length}/${appIds.length} successful`,
                        `Files: ${allFiles.reduce((sum, result) => sum + result.files.length, 0)} total`,
                        `Your Bulk Limit: ${validGames.length}/${userBulkLimit} games used`
                    ].join('\n'),
                    inline: false 
                }
            )
            .setTimestamp();

        // Upload the file (bulk downloads are likely to be large)
        const uploadingEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Success} ${await t('BULK_DOWNLOAD_SUCCESS', interaction.guildId)}`)
            .setDescription(`${emojis.Load} ${await t('BULK_DOWNLOAD_UPLOADING', interaction.guildId, { size: zipSizeMB.toFixed(2) })}`)
            .setColor(0x5865F2);
        await interaction.editReply({ embeds: [uploadingEmbed] });

        const downloadUrl = await uploadFile(zipBuffer, zipFileName);
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel(await t('DOWNLOAD_BUTTON', interaction.guildId))
                    .setStyle('Link')
                    .setURL(downloadUrl)
                    .setEmoji(emojis.Download)
            );

        successEmbed.setDescription(await t('UPLOAD_COMPLETE', interaction.guildId));
        await interaction.editReply({ embeds: [successEmbed], components: [row] });

    } catch (error) {
        console.error('Error in genbulk command:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle(`${emojis.Error} ${await t('BULK_DOWNLOAD_ERROR', interaction.guildId)}`)
            .setDescription(error.message);

        // Handle reply based on interaction state
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
} 