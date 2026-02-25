import { SlashCommandBuilder } from 'discord.js';
import { clearSteamCaches } from '../utils/gen.js';

export const data = new SlashCommandBuilder()
  .setName('clearcache')
  .setDescription('Clear the Steam info and CCU caches (admin only)');

export async function execute(interaction) {
  if (!interaction.memberPermissions?.has('Administrator')) {
    return interaction.reply({ content: 'You need to be an administrator to use this command.', ephemeral: true });
  }
  clearSteamCaches();
  return interaction.reply({ content: 'Steam info and CCU caches have been cleared.', ephemeral: true });
} 