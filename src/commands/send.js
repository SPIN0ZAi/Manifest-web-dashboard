import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageType
} from 'discord.js';
import { emojis } from '../utils/emojis.js';

export const data = new SlashCommandBuilder()
  .setName('send')
  .setDescription('Send a message or reply to a message as the bot. (Owner only)')
  .addStringOption((opt) =>
    opt
      .setName('message')
      .setDescription('The message content to send.')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName('channel')
      .setDescription('The channel ID to send the message to (optional, defaults to current channel).')
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName('reply_to')
      .setDescription('The message ID to reply to (optional).')
      .setRequired(false)
  )
  .addBooleanOption((opt) =>
    opt
      .setName('embed')
      .setDescription('Send the message as an embed (optional, defaults to false).')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Owner-only check
  const OWNER_ID = process.env.BOT_OWNER_ID || '';
  if (interaction.user.id !== OWNER_ID) {
    console.log(`[SECURITY] Denied /send to ${interaction.user.tag} (${interaction.user.id}) - not owner`);
    return interaction.reply({
      content: '❌ This command is only available to the bot owner.',
      ephemeral: true
    });
  }

  const messageContent = interaction.options.getString('message');
  const channelId = interaction.options.getString('channel');
  const replyToId = interaction.options.getString('reply_to');
  const useEmbed = interaction.options.getBoolean('embed') || false;

  // Defer immediately to prevent interaction expiration
  await interaction.deferReply({ ephemeral: true });

  try {
    // Determine target channel
    let targetChannel = interaction.channel;
    if (channelId) {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${emojis.Deined} Channel Not Found`)
              .setDescription(`${emojis.Hint} The specified channel ID is invalid or the bot doesn't have access to it.`)
              .setColor(0xff0000),
          ],
        });
      }

      // Check if bot has permission to send messages in that channel
      if (!channel.permissionsFor(interaction.client.user).has(PermissionFlagsBits.SendMessages)) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${emojis.Deined} Permission Error`)
              .setDescription(`${emojis.Hint} The bot doesn't have permission to send messages in that channel.`)
              .setColor(0xff0000),
          ],
        });
      }

      targetChannel = channel;
    }

    // Prepare message options
    const messageOptions = {};

    // If replying to a message, fetch it and set up reply
    if (replyToId) {
      try {
        const replyToMessage = await targetChannel.messages.fetch(replyToId);
        messageOptions.reply = {
          failIfNotExists: false,
          messageReference: replyToMessage
        };
      } catch (error) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(`${emojis.Deined} Message Not Found`)
              .setDescription(`${emojis.Hint} The specified message ID to reply to was not found in the target channel.`)
              .setColor(0xff0000),
          ],
        });
      }
    }

    // Send the message
    let sentMessage;
    if (useEmbed) {
      const embed = new EmbedBuilder()
        .setDescription(messageContent)
        .setColor(0x57f287)
        .setTimestamp();

      sentMessage = await targetChannel.send({
        embeds: [embed],
        ...messageOptions
      });
    } else {
      sentMessage = await targetChannel.send({
        content: messageContent,
        ...messageOptions
      });
    }

    // Success response
    const successEmbed = new EmbedBuilder()
      .setTitle(`${emojis.Success} Message Sent Successfully`)
      .setDescription(`${emojis.Hint} Message sent to ${targetChannel.toString()}`)
      .addFields(
        { name: 'Channel', value: targetChannel.name, inline: true },
        { name: 'Message ID', value: sentMessage.id, inline: true },
        { name: 'Type', value: useEmbed ? 'Embed' : 'Text', inline: true }
      )
      .setColor(0x57f287)
      .setTimestamp();

    if (replyToId) {
      successEmbed.addFields({ name: 'Replied to', value: replyToId, inline: true });
    }

    await interaction.editReply({
      embeds: [successEmbed],
    });

    // Log the action for security
    console.log(`[SEND COMMAND] ${interaction.user.tag} (${interaction.user.id}) sent message in ${targetChannel.name} (${targetChannel.id}): "${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`);

  } catch (error) {
    console.error('Send command failed:', error);

    let errorMessage = 'An unexpected error occurred while sending the message.';
    if (error.code === 50013) {
      errorMessage = 'The bot lacks permission to send messages in the target channel.';
    } else if (error.code === 50001) {
      errorMessage = 'The bot cannot access the target channel.';
    } else if (error.code === 50005) {
      errorMessage = 'The message content is too long.';
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${emojis.Deined} Error`)
          .setDescription(`${emojis.Hint} ${errorMessage}`)
          .setColor(0xff0000),
      ],
    });
  }
} 