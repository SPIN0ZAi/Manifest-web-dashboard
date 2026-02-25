// Command to notify users when an unreleased game is finally added
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('notify-release')
    .setDescription('Notify users when an unreleased game is now available (Admin only)')
    .addStringOption(option =>
        option.setName('appid')
            .setDescription('The Steam AppID of the newly released game')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('game-name')
            .setDescription('The name of the game (optional, will fetch from Steam if not provided)')
            .setRequired(false));

export async function execute(interaction) {
    // Check if user has admin permissions
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({
            content: '❌ Only server administrators can use this command.',
            ephemeral: true
        });
    }

    const appId = interaction.options.getString('appid');
    const gameName = interaction.options.getString('game-name');

    await interaction.deferReply({ ephemeral: true });

    try {
        const db = await getDb();
        
        // Get all users who requested notifications for this game
        const notifications = await db.collection('release-notifications')
            .find({ appId: appId, status: 'active' })
            .toArray();

        if (notifications.length === 0) {
            return interaction.editReply({
                content: `📝 No users have requested notifications for AppID \`${appId}\`.`
            });
        }

        let gameDisplayName = gameName;
        if (!gameDisplayName) {
            // Try to get game name from our database
            const gameRecord = await db.collection('games').findOne({ appId: appId });
            gameDisplayName = gameRecord?.name || `Game ${appId}`;
        }

        let successCount = 0;
        let failureCount = 0;

        // Send notifications to each user
        for (const notification of notifications) {
            try {
                const user = await interaction.client.users.fetch(notification.userId);
                
                const notificationEmbed = new EmbedBuilder()
                    .setTitle('🎉 Game Released! Your Wait is Over!')
                    .setColor(0x00ff00)
                    .setDescription(`**${gameDisplayName}** is now available in our database!`)
                    .addFields([
                        {
                            name: '🎮 Game',
                            value: gameDisplayName,
                            inline: true
                        },
                        {
                            name: '🔢 AppID',
                            value: `\`${appId}\``,
                            inline: true
                        },
                        {
                            name: '⚡ How to Download',
                            value: `Use \`/gen game:${appId}\` in any server with the bot!`,
                            inline: false
                        }
                    ])
                    .setFooter({ 
                        text: '🔔 You requested to be notified when this game was released',
                        iconURL: user.displayAvatarURL()
                    })
                    .setTimestamp();

                await user.send({ embeds: [notificationEmbed] });
                successCount++;

                // Mark notification as completed
                await db.collection('release-notifications').updateOne(
                    { _id: notification._id },
                    { $set: { status: 'completed', notifiedAt: new Date() } }
                );

            } catch (error) {
                console.error(`Failed to notify user ${notification.userId}:`, error);
                failureCount++;
            }
        }

        // Send summary to admin
        const summaryEmbed = new EmbedBuilder()
            .setTitle('📢 Release Notification Summary')
            .setColor(0x00ff00)
            .addFields([
                {
                    name: '🎮 Game',
                    value: gameDisplayName,
                    inline: true
                },
                {
                    name: '🔢 AppID',
                    value: `\`${appId}\``,
                    inline: true
                },
                {
                    name: '✅ Successful Notifications',
                    value: successCount.toString(),
                    inline: true
                },
                {
                    name: '❌ Failed Notifications',
                    value: failureCount.toString(),
                    inline: true
                },
                {
                    name: '👥 Total Users Notified',
                    value: `${successCount}/${notifications.length}`,
                    inline: true
                }
            ])
            .setTimestamp();

        await interaction.editReply({ embeds: [summaryEmbed] });

    } catch (error) {
        console.error('Error sending release notifications:', error);
        await interaction.editReply({
            content: '❌ An error occurred while sending notifications. Please check the logs.'
        });
    }
}