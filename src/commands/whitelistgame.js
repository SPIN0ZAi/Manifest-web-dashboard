import { SlashCommandBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const whitelistPath = path.join(__dirname, '../utils/gameWhitelist.json');

export const data = new SlashCommandBuilder()
  .setName('whitelistgame')
  .setDescription('Whitelist a game by AppID (admin only)')
  .addIntegerOption(opt =>
    opt.setName('appid')
      .setDescription('The Steam AppID to whitelist')
      .setRequired(true)
  );

export async function execute(interaction) {
  // Check admin permission
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: 'You need to be an administrator to use this command.', ephemeral: true });
  }

  const appid = interaction.options.getInteger('appid');
  let whitelist = [];
  try {
    whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf-8'));
  } catch (e) {
    // If file doesn't exist or is invalid, start with empty
    whitelist = [];
  }
  if (whitelist.includes(appid)) {
    return interaction.reply({ content: `AppID \`${appid}\` is already whitelisted.`, ephemeral: true });
  }
  whitelist.push(appid);
  fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2));
  return interaction.reply({ content: `AppID \`${appid}\` has been added to the whitelist.`, ephemeral: true });
} 