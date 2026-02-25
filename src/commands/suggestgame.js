import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fuzzyFindGames } from '../utils/gen.js';

export const data = new SlashCommandBuilder()
  .setName('suggestgame')
  .setDescription('Suggest similar games by name (fuzzy search)')
  .addStringOption(opt =>
    opt.setName('name')
      .setDescription('Partial or misspelled game name')
      .setRequired(true)
  );

export async function execute(interaction) {
  const name = interaction.options.getString('name');
  const matches = await fuzzyFindGames(name, 5);
  if (!matches.length) {
    return interaction.reply({ content: 'No similar games found.', ephemeral: true });
  }
  const embed = new EmbedBuilder()
    .setTitle('Similar Games')
    .setDescription(matches.map(g => `**${g.name}** (AppID: \`${g.appId || g.appid}\`)`).join('\n'))
    .setColor(0x5865F2);
  return interaction.reply({ embeds: [embed], ephemeral: true });
} 