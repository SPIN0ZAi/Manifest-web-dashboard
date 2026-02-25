import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Displays usage statistics for the bot.');

export async function execute(interaction) {
    const db = await getDb();
    const stats = await db.collection('stats').find().sort({ count: -1 }).limit(10).toArray();

    const embed = new EmbedBuilder()
        .setTitle(`${emojis.Usage} SB MANIFEST Usage Statistics`)
        .setColor(0x5865F2) // Blurple
        .setTimestamp()
        .setFooter({ text: 'SB MANIFEST' });

    if (stats.length === 0) {
        embed.setDescription('No usage data has been recorded yet.');
    } else {
        const fields = stats.map((stat, index) => ({
            name: `#${index + 1}`,
            value: `${emojis.AppID} \`${stat.appId}\`\n${emojis.Requester} Requested \`${stat.count}\` time(s)`,
            inline: false
        }));
        embed.addFields(fields);
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
} 