import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getUpdateStats, checkGameNeedsUpdate, getDlcDepotInfo } from '../utils/manifestUpdater.js';

export const data = new SlashCommandBuilder()
  .setName('manifeststats')
  .setDescription('Check manifest update system statistics and test API')
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('Show manifest update statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('check')
      .setDescription('Check if a specific game needs manifest updates')
      .addStringOption(option =>
        option.setName('appid')
          .setDescription('Steam App ID to check')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('dlc')
      .setDescription('Test DLC depot info lookup')
      .addStringOption(option =>
        option.setName('basegame')
          .setDescription('Base game App ID')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('dlcid')
          .setDescription('DLC App ID')
          .setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === 'stats') {
      await interaction.deferReply({ ephemeral: true });
      
      const stats = await getUpdateStats();
      
      if (stats.error) {
        return interaction.editReply({
          content: `❌ Error getting stats: ${stats.errorMessage || stats.error}`
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Manifest Update System Statistics')
        .setColor(stats.manifestHubApiConfigured ? 0x57f287 : 0xffa500)
        .addFields(
          {
            name: '🎮 Game Coverage',
            value: `Total Games: ${stats.totalGames}\n` +
                   `With Manifests: ${stats.gamesWithManifests}\n` +
                   `Coverage: ${stats.manifestCoverage}%`,
            inline: true
          },
          {
            name: '🔄 Recent Activity',
            value: `Updated (24h): ${stats.recentlyUpdated}\n` +
                   `Last Check: ${new Date(stats.lastCheck).toLocaleString()}`,
            inline: true
          },
          {
            name: '🔑 API Status',
            value: `ManifestHub API: ${stats.manifestHubApiConfigured ? '✅ Configured' : '❌ Not Set'}\n` +
                   `Key Expires: ${stats.apiKeyExpiry ? new Date(stats.apiKeyExpiry).toLocaleString() : 'Not Set'}`,
            inline: false
          }
        )
        .setFooter({ text: 'Use /setapikey to configure ManifestHub API access' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (subcommand === 'check') {
      const appId = interaction.options.getString('appid');
      
      await interaction.deferReply({ ephemeral: true });
      
      const result = await checkGameNeedsUpdate(appId);
      
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Manifest Check: ${appId}`)
        .setColor(result.hasUpdate ? 0xffa500 : result.error ? 0xf23c50 : 0x57f287);

      if (result.error) {
        embed.setDescription(`❌ Error: ${result.error}`);
      } else {
        const status = result.hasUpdate ? '🆕 Update Available' : '✅ Up to Date';
        embed.setDescription(status);
        
        embed.addFields(
          {
            name: '📦 Depot Count',
            value: `${result.manifestCount} depots found`,
            inline: true
          }
        );

        if (result.hasUpdate && result.depotUpdates) {
          const updates = Object.entries(result.depotUpdates)
            .map(([depot, info]) => `Depot ${depot}: ${info.current} → ${info.latest}`)
            .join('\n');
          
          embed.addFields({
            name: '🔄 Updates Needed',
            value: updates.length > 1000 ? updates.substring(0, 1000) + '...' : updates,
            inline: false
          });
        }
      }

      await interaction.editReply({ embeds: [embed] });

    } else if (subcommand === 'dlc') {
      const baseGame = interaction.options.getString('basegame');
      const dlcId = interaction.options.getString('dlcid');
      
      await interaction.deferReply({ ephemeral: true });
      
      const dlcInfo = await getDlcDepotInfo(baseGame, dlcId);
      
      const embed = new EmbedBuilder()
        .setTitle(`🎯 DLC Depot Check`)
        .setColor(dlcInfo ? 0x57f287 : 0xffa500);

      if (dlcInfo) {
        embed.setDescription('✅ DLC depot found!')
          .addFields(
            {
              name: '📋 Depot Info',
              value: `Depot ID: ${dlcInfo.depotId}\n` +
                     `Manifest ID: ${dlcInfo.manifestId}\n` +
                     `Base Game: ${dlcInfo.baseGameId}`,
              inline: true
            },
            {
              name: '📁 File Details',
              value: `Size: ${dlcInfo.size} bytes\n` +
                     `Download: ${dlcInfo.download}\n` +
                     `File: ${dlcInfo.manifestFile}`,
              inline: true
            }
          );
      } else {
        embed.setDescription(`❌ DLC depot ${dlcId} not found in base game ${baseGame}`);
      }

      await interaction.editReply({ embeds: [embed] });
    }

  } catch (error) {
    console.error('Error in manifeststats command:', error);
    const errorMessage = '❌ Command failed. Check console for details.';
    
    if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}