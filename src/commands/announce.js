import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';
import { announceAppId } from '../utils/branch-checker.js';

// Safe guild ID where sensitive commands are allowed
const SAFE_GUILD_ID = '1317915330084995163';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Manually announces a new AppID to all configured servers.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName('appid')
      .setDescription('The AppID to announce.')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Security check: Only allow this command in the safe guild
  if (interaction.guildId !== SAFE_GUILD_ID) {
    console.log(`[SECURITY] Denied /announce to ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId} - not safe guild`);
    return interaction.reply({ 
      content: '❌ This command is only available in the safe server.', 
      ephemeral: true 
    });
  }

  // Permission guard
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emojis.Deined} Permission Denied`)
          .setDescription(`${emojis.Hint} Only administrators can use this.`)
          .setColor(0xff0000),
      ],
      ephemeral: true,
    });
  }

  const appid = interaction.options.getString('appid');

  // 1) Defer immediately
  await interaction.deferReply({ ephemeral: true });

  try {
    // 2) Do the announce
    const resultMessage = await announceAppId(interaction.client, appid);

    // 3) Edit reply with results
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emojis.Success} Announcement Result`)
          .setDescription(resultMessage)
          .setColor(0x57f287),
      ],
    });
  } catch (error) {
    console.error('Announce command failed:', error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emojis.Deined} An Error Occurred`)
          .setDescription(`${emojis.Hint} Could not process the announcement.`)
          .setColor(0xff0000),
      ],
    });
  }
}
