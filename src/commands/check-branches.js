import { SlashCommandBuilder } from 'discord.js';
import { checkForNewBranches } from '../utils/branch-checker.js';

const emojis = {
  Success: '<:done:1382226404061483008>',
  Deined: '<:action:1382221648890957845>',
  Hint: '<:reason:1382221647259500634>',
};

export const data = new SlashCommandBuilder()
  .setName('check-branches')
  .setDescription('Manually triggers the branch checker for new games.')
  .setDefaultMemberPermissions(0); // Admin only

export async function execute(interaction) {
  // 1) Defer immediately
  await interaction.deferReply({ ephemeral: true });

  try {
    // 2) Do your work
    await checkForNewBranches(interaction.client);

    // 3) Edit the deferred reply
    await interaction.editReply(
      `${emojis.Success} Branch check initiated. See the console for progress and results.`
    );
  } catch (error) {
    console.error('Failed to manually run branch checker:', error);
    await interaction.editReply(
      `${emojis.Deined} An error occurred while trying to run the branch checker.`
    );
  }
}
