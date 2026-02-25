// Service status and shutdown information command
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the current service status and availability');

export async function execute(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('📊 Service Status Dashboard')
        .setColor(0x3498db)
        .setDescription('**Current Bot Service Information**')
        .addFields([
            {
                name: '🟢 Online Services',
                value: '✅ Basic bot functionality\n✅ Server information commands\n✅ Configuration settings\n✅ Help and support',
                inline: true
            },
            {
                name: '🔴 Offline Services', 
                value: '🚫 Game manifest downloads\n🚫 Lua script generation\n🚫 File uploads\n🚫 Game collections',
                inline: true
            },
            {
                name: '⚖️ Legal Compliance Notice',
                value: '📋 **Why are services limited?**\n\n' +
                       '🛡️ We\'ve temporarily **paused** game file distribution to ensure **full legal compliance**.\n\n' +
                       '💼 While we could continue operating, we\'re taking a **responsible approach** to respect intellectual property rights.',
                inline: false
            },
            {
                name: '🚀 Future Plans',
                value: '🔍 **What we\'re working on:**\n\n' +
                       '📝 Exploring **proper licensing agreements**\n' +
                       '🤝 Investigating **legitimate partnerships**\n' +
                       '⚖️ Ensuring **complete legal compliance**\n' +
                       '🎮 Finding **alternative solutions** for gamers',
                inline: false
            },
            {
                name: '💙 Thank You',
                value: '🙏 **To our amazing community:**\n\n' +
                       'Your **understanding** and **patience** mean everything to us. We\'re committed to finding a way to serve you **legally** and **safely**.\n\n' +
                       '✨ *Keep gaming, keep dreaming!* ✨',
                inline: false
            }
        ])
        .setFooter({ 
            text: 'Updated: Taking responsibility for the gaming community',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}