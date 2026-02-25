import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { setServerLanguage } from '../utils/localization.js';
import { emojis } from '../utils/emojis.js';
import { getDb } from '../utils/database.js';

// Safe guild ID where sensitive commands are allowed
const SAFE_GUILD_ID = '1317915330084995163';

export const data = new SlashCommandBuilder()
    .setName('language')
    .setDescription('Sets the language for the bot on this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
        option.setName('lang')
            .setDescription('The language to set.')
            .setRequired(true)
            .addChoices(
                { name: 'English', value: 'en' },
                { name: 'العربية (Arabic)', value: 'ar' }
            ));

export async function execute(interaction) {
    // Security check: Only allow this command in the safe guild
    if (interaction.guildId !== SAFE_GUILD_ID) {
        console.log(`[SECURITY] Denied /language to ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId} - not safe guild`);
        return interaction.reply({ 
            content: '❌ This command is only available in the safe server.', 
            ephemeral: true 
        });
    }

    const lang = interaction.options.getString('lang');
    const guildId = interaction.guildId;

    try {
        await setServerLanguage(guildId, lang);
        const embed = new EmbedBuilder()
            .setTitle(`${emojis.Success} Language Set`)
            .setDescription(`Bot language has been set to **${lang}**.`)
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: 'SB MANIFEST' });
        await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
        const errorEmbed = new EmbedBuilder()
            .setTitle(`${emojis.Error} Error`)
            .setDescription(error.message)
            .setColor(0xFF0000)
            .setTimestamp()
            .setFooter({ text: 'SB MANIFEST' });
        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
} 