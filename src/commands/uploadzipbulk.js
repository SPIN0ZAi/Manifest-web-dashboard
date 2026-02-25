import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { processZipFile } from './uploadzip.js';
import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateOrCreateBranch } from '../utils/github.js';
import { broadcastGameAlert, broadcastUpdatedGameAlert } from '../utils/alerts.js';
import { setStoredBuildVersion } from '../utils/manifestProcessor.js';
import { emojis } from '../utils/emojis.js';

const SAFE_GUILD_ID = '1317915330084995163';

export const data = new SlashCommandBuilder()
  .setName('uploadzipbulk')
  .setDescription('Upload up to 20 ZIP files containing .lua and .manifest files (bulk upload)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  // Add up to 20 attachment options
  .addAttachmentOption(option =>
    option.setName('zipfile1').setDescription('ZIP file 1').setRequired(true))
  .addAttachmentOption(option =>
    option.setName('zipfile2').setDescription('ZIP file 2').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile3').setDescription('ZIP file 3').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile4').setDescription('ZIP file 4').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile5').setDescription('ZIP file 5').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile6').setDescription('ZIP file 6').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile7').setDescription('ZIP file 7').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile8').setDescription('ZIP file 8').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile9').setDescription('ZIP file 9').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile10').setDescription('ZIP file 10').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile11').setDescription('ZIP file 11').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile12').setDescription('ZIP file 12').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile13').setDescription('ZIP file 13').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile14').setDescription('ZIP file 14').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile15').setDescription('ZIP file 15').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile16').setDescription('ZIP file 16').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile17').setDescription('ZIP file 17').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile18').setDescription('ZIP file 18').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile19').setDescription('ZIP file 19').setRequired(false))
  .addAttachmentOption(option =>
    option.setName('zipfile20').setDescription('ZIP file 20').setRequired(false));

export async function execute(interaction) {
  if (interaction.guildId !== SAFE_GUILD_ID) {
    return interaction.reply({
      content: '❌ This command is only available in the safe server.',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  // Collect all provided zip attachments
  const zipAttachments = [];
  for (let i = 1; i <= 20; i++) {
    const att = interaction.options.getAttachment(`zipfile${i}`);
    if (att) zipAttachments.push(att);
  }

  if (zipAttachments.length === 0) {
    return interaction.editReply({ content: 'No zip files provided.' });
  }

  const results = [];
  for (const zipAttachment of zipAttachments) {
    if (!zipAttachment.name.endsWith('.zip')) {
      results.push({ name: zipAttachment.name, error: 'Not a .zip file' });
      continue;
    }
    try {
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'uploadzipbulk-'));
      const zipPath = path.join(tempDir, zipAttachment.name);
      const response = await fetch(zipAttachment.url);
      if (!response.ok) throw new Error(`Failed to download ZIP: ${response.statusText}`);
      await fs.promises.writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
      const { processedFiles, errors, missingDepotKeys } = await processZipFile(zipPath);
      // Upload each set of files to GitHub and send alerts (reuse uploadzip logic)
      const uploadedGames = [];
      const uploadErrors = [];
      for (const { appId, gameData, files, zipSizeMB, manifestCount, skippedManifests } of processedFiles) {
        try {
          let uploadResult = await updateOrCreateBranch(appId, files);
          let isUpdate = !uploadResult.isNewGame;
          let buildVersion = null;
          for (const file of files) {
            if (file.name.endsWith('.manifest')) {
              const buildIdMatch = file.content.toString('utf8').match(/"buildid"\s+"?(\d+)"?/i);
              if (buildIdMatch) {
                buildVersion = buildIdMatch[1];
                break;
              }
            }
          }
          if (buildVersion) setStoredBuildVersion(appId, buildVersion);
          try {
            if (isUpdate) {
              await broadcastUpdatedGameAlert(interaction.client, gameData, zipSizeMB, appId, interaction.user);
            } else {
              await broadcastGameAlert(interaction.client, gameData, zipSizeMB, appId, interaction.user);
            }
          } catch {}
          uploadedGames.push({ appId, gameData, zipSizeMB, manifestCount, skippedManifests, isUpdate, buildVersion });
        } catch (error) {
          uploadErrors.push(`${appId} (${gameData?.name || 'Unknown'}): ${error.message}`);
        }
      }
      results.push({
        name: zipAttachment.name,
        uploadedGames,
        errors,
        uploadErrors,
        missingDepotKeys
      });
    } catch (err) {
      results.push({ name: zipAttachment.name, error: err.message });
    }
  }

  // Build a summary embed
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.Success} Bulk Upload Results`)
    .setColor(0x00FF00)
    .setDescription(`Processed **${results.length}** zip files.`);

  for (const result of results) {
    if (result.error) {
      embed.addFields({ name: result.name, value: `❌ Error: ${result.error}` });
      continue;
    }
    if (result.uploadedGames && result.uploadedGames.length > 0) {
      embed.addFields({
        name: result.name,
        value: result.uploadedGames.map(g => `${g.appId} - ${g.gameData.name} (${g.manifestCount} manifests) ${g.isUpdate ? '🔄' : '🆕'} | 🛠️ ${g.buildVersion || 'N/A'}`).join('\n').slice(0, 1024)
      });
    }
    if (result.errors && result.errors.length > 0) {
      embed.addFields({ name: `${result.name} - Processing Errors`, value: result.errors.join('\n').slice(0, 1024) });
    }
    if (result.uploadErrors && result.uploadErrors.length > 0) {
      embed.addFields({ name: `${result.name} - Upload Errors`, value: result.uploadErrors.join('\n').slice(0, 1024) });
    }
    if (result.missingDepotKeys && result.missingDepotKeys.length > 0) {
      embed.addFields({ name: `${result.name} - Missing Depot Keys`, value: `${result.missingDepotKeys.length} manifest(s) need depot keys. Use /upload to add them.` });
    }
  }

  await interaction.editReply({ embeds: [embed] });
} 