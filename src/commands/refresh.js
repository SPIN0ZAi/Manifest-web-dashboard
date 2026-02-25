import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { emojis } from '../utils/emojis.js';

// Safe guild ID where sensitive commands are allowed
const SAFE_GUILD_ID = '1317915330084995163';

export const data = new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Admin-only command to refresh application data.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false); // This command cannot be used in DMs

export async function execute(interaction) {
    // Security check: Only allow this command in the safe guild
    if (interaction.guildId !== SAFE_GUILD_ID) {
        console.log(`[SECURITY] Denied /refresh to ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId} - not safe guild`);
        return interaction.reply({ 
            content: '❌ This command is only available in the safe server.', 
            ephemeral: true 
        });
    }

    // In a real implementation, you might clear a cache or reload configuration here.
    // For now, we will just send a confirmation message.

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Success} Refresh Complete`)
        .setColor(0x57F287) // Green
        .setTimestamp()
        .setFooter({ text: 'SB MANIFEST' });

    await interaction.reply({ embeds: [embed], flags: 64 });
} 