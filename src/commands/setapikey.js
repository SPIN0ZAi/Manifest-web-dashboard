import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getDb } from '../utils/database.js';

export const data = new SlashCommandBuilder()
  .setName('setapikey')
  .setDescription('Update ManifestHub API key (Admin only)')
  .addStringOption(option =>
    option.setName('apikey')
      .setDescription('The new ManifestHub API key')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    // Double-check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You need Administrator permissions to use this command.',
        ephemeral: true
      });
    }

    const newApiKey = interaction.options.getString('apikey');
    
    // Basic validation
    if (!newApiKey || newApiKey.length < 10) {
      return interaction.reply({
        content: '❌ Invalid API key format. Please provide a valid ManifestHub API key.',
        ephemeral: true
      });
    }

    // Store the API key in database
    const db = await getDb();
    await db.collection('config').updateOne(
      { _id: 'manifesthub-api' },
      {
        $set: {
          apiKey: newApiKey,
          updatedAt: new Date(),
          updatedBy: interaction.user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
        }
      },
      { upsert: true }
    );

    console.log(`[SECURITY] ManifestHub API key updated by ${interaction.user.tag} (${interaction.user.id})`);

    await interaction.reply({
      content: '✅ ManifestHub API key has been updated successfully.\n' +
               '🔒 The key will expire in 24 hours and need to be renewed.\n' +
               '📝 This action has been logged for security purposes.',
      ephemeral: true
    });

  } catch (error) {
    console.error('Error updating ManifestHub API key:', error);
    await interaction.reply({
      content: '❌ Failed to update API key. Please try again or contact support.',
      ephemeral: true
    });
  }
}