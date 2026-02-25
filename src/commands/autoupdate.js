// src/commands/autoupdate.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { 
  batchAutoUpdate, 
  getAutoUpdateStats, 
  getAutoUpdateStatus, 
  forceUpdateGame,
  scheduleAutoUpdates 
} from '../utils/autoUpdater.js';
import { getDb } from '../utils/database.js';
import { emojis } from '../utils/emojis.js';

export const cooldown = 60;
export const data = new SlashCommandBuilder()
  .setName('autoupdate')
  .setDescription('Manage auto-update system for manifests')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check auto-update status for a game')
      .addStringOption(option =>
        option
          .setName('appid')
          .setDescription('The Steam AppID to check')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('force')
      .setDescription('Force update a specific game')
      .addStringOption(option =>
        option
          .setName('appid')
          .setDescription('The Steam AppID to force update')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('batch')
      .setDescription('Run batch auto-update for all games')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('Show auto-update statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start the auto-update scheduler')
  );

export async function execute(interaction) {
  // Check if user has admin permissions
  if (!interaction.member.permissions.has('Administrator')) {
    return interaction.reply({
      content: '❌ You need Administrator permissions to use this command.',
      ephemeral: true
    });
  }

  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply();

    switch (subcommand) {
      case 'status':
        await handleStatus(interaction);
        break;
      case 'force':
        await handleForce(interaction);
        break;
      case 'batch':
        await handleBatch(interaction);
        break;
      case 'stats':
        await handleStats(interaction);
        break;
      case 'start':
        await handleStart(interaction);
        break;
      default:
        await interaction.editReply('❌ Unknown subcommand.');
    }
  } catch (error) {
    console.error('Error in autoupdate command:', error);
    await interaction.editReply('❌ An error occurred while processing your request.');
  }
}

async function handleStatus(interaction) {
  const appId = interaction.options.getString('appid');
  
  try {
    const status = await getAutoUpdateStatus(appId);
    
    if (status.error) {
      await interaction.editReply(`❌ ${status.error}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔄 Auto-Update Status: ${status.name}`)
      .setColor(status.needsUpdate ? 0xff6b35 : 0x57f287)
      .addFields([
        {
          name: '📊 AppID',
          value: status.appId,
          inline: true
        },
        {
          name: '📋 Current Manifest',
          value: status.currentManifestId || 'N/A',
          inline: true
        },
        {
          name: '🔄 Needs Update',
          value: status.needsUpdate ? '❌ YES' : '✅ NO',
          inline: true
        },
        {
          name: '📅 Last Updated',
          value: status.lastUpdated ? new Date(status.lastUpdated).toLocaleString() : 'Never',
          inline: true
        },
        {
          name: '🤖 Auto-Updated',
          value: status.autoUpdated ? '✅ Yes' : '❌ No',
          inline: true
        },
        {
          name: '⏰ Last Checked',
          value: new Date(status.lastChecked).toLocaleString(),
          inline: true
        }
      ]);

    if (status.needsUpdate) {
      embed.addFields([
        {
          name: '🆕 Latest Manifest',
          value: status.latestManifestId,
          inline: true
        },
        {
          name: '🏗️ Build ID',
          value: status.buildId || 'N/A',
          inline: true
        },
        {
          name: '📅 Update Timestamp',
          value: new Date(status.timestamp * 1000).toLocaleString(),
          inline: true
        }
      ]);
    }

    const forceBtn = new ButtonBuilder()
      .setCustomId(`force_update_${appId}`)
      .setLabel('Force Update')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔄');

    const row = new ActionRowBuilder().addComponents(forceBtn);
    
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('Error getting status:', error);
    await interaction.editReply('❌ Failed to get auto-update status.');
  }
}

async function handleForce(interaction) {
  const appId = interaction.options.getString('appid');
  
  try {
    await interaction.editReply('🔄 Force updating game...');
    
    const result = await forceUpdateGame(appId);
    
    if (result.error) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }

    if (result.updated) {
      const embed = new EmbedBuilder()
        .setTitle('✅ Force Update Successful')
        .setColor(0x57f287)
        .addFields([
          {
            name: '📊 AppID',
            value: appId,
            inline: true
          },
          {
            name: '📋 Old Manifest',
            value: result.oldManifestId,
            inline: true
          },
          {
            name: '🆕 New Manifest',
            value: result.newManifestId,
            inline: true
          },
          {
            name: '🏗️ Build ID',
            value: result.buildId || 'N/A',
            inline: true
          },
          {
            name: '📁 File Count',
            value: result.fileCount?.toString() || 'N/A',
            inline: true
          },
          {
            name: '💾 Size',
            value: result.size ? `${(result.size / (1024 * 1024)).toFixed(2)} MB` : 'N/A',
            inline: true
          }
        ]);

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply(`ℹ️ ${result.reason}`);
    }
  } catch (error) {
    console.error('Error force updating:', error);
    await interaction.editReply('❌ Failed to force update game.');
  }
}

async function handleBatch(interaction) {
  try {
    await interaction.editReply('🔄 Starting batch auto-update... This may take a while.');
    
    const result = await batchAutoUpdate();
    
    if (result.error) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Batch Auto-Update Complete')
      .setColor(0x57f287)
      .addFields([
        {
          name: '📊 Total Games',
          value: result.totalGames.toString(),
          inline: true
        },
        {
          name: '✅ Updated',
          value: result.updatedCount.toString(),
          inline: true
        },
        {
          name: '❌ Errors',
          value: result.errorCount.toString(),
          inline: true
        }
      ]);

    if (result.results.length > 0) {
      const updateList = result.results.slice(0, 10).map(game => 
        `• **${game.name}** (${game.appId}): ${game.oldManifest} → ${game.newManifest}`
      ).join('\n');
      
      embed.addFields({
        name: '🔄 Recent Updates',
        value: updateList + (result.results.length > 10 ? '\n... and more' : ''),
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in batch update:', error);
    await interaction.editReply('❌ Failed to run batch auto-update.');
  }
}

async function handleStats(interaction) {
  try {
    const stats = await getAutoUpdateStats();
    
    if (stats.error) {
      await interaction.editReply(`❌ ${stats.error}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 Auto-Update Statistics')
      .setColor(0x5865F2)
      .addFields([
        {
          name: '🎮 Total Games',
          value: stats.totalGames.toString(),
          inline: true
        },
        {
          name: '🤖 Auto-Updated',
          value: stats.autoUpdatedGames.toString(),
          inline: true
        },
        {
          name: '📅 Recently Updated (24h)',
          value: stats.recentlyUpdated.toString(),
          inline: true
        },
        {
          name: '⚙️ Auto-Update Status',
          value: stats.autoUpdateEnabled ? '✅ Enabled' : '❌ Disabled',
          inline: true
        },
        {
          name: '⏰ Next Scheduled Update',
          value: new Date(stats.nextScheduledUpdate).toLocaleString(),
          inline: true
        }
      ]);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting stats:', error);
    await interaction.editReply('❌ Failed to get auto-update statistics.');
  }
}

async function handleStart(interaction) {
  try {
    await interaction.editReply('🕐 Starting auto-update scheduler...');
    
    // Start the scheduler
    scheduleAutoUpdates();
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Auto-Update Scheduler Started')
      .setColor(0x57f287)
      .setDescription('The auto-update system is now running!')
      .addFields([
        {
          name: '⏰ Update Interval',
          value: 'Every 6 hours',
          inline: true
        },
        {
          name: '🚀 Initial Update',
          value: 'In 1 minute',
          inline: true
        },
        {
          name: '📊 Rate Limiting',
          value: '1 request/second',
          inline: true
        }
      ]);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error starting scheduler:', error);
    await interaction.editReply('❌ Failed to start auto-update scheduler.');
  }
} 