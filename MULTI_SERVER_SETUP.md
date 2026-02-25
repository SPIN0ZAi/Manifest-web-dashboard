# SB Manifest Bot - Multi-Server Setup Guide

## Overview

Your SB Manifest Bot has been upgraded to support multiple servers safely and efficiently. The bot now automatically detects server types and provides appropriate command access based on the server's role.

## Server Types

### 1. Safe Server (Primary)
- **ID:** `1317915330084995163`
- **Access:** All commands available
- **Purpose:** Bot owner operations, file uploads, advanced management
- **Commands:** Full access to all functionality

### 2. Main Server
- **ID:** `1317915330084995163` (Same as safe server for now)
- **Access:** Core gaming commands + admin settings
- **Purpose:** Primary gaming community server
- **Commands:** `gen`, `genbulk`, `gendlc`, `gensettings`, `stats`, `checkgame`, `suggestgame`, `serverinfo`

### 3. Regular Servers
- **Access:** Basic gaming commands + essential admin settings
- **Purpose:** Community servers, gaming groups
- **Commands:** `gen`, `genbulk`, `gendlc`, `gensettings`, `stats`, `checkgame`, `suggestgame`, `serverinfo`

## New Commands

### `/serverinfo`
- Shows current server configuration
- Displays available commands for the server
- Helps admins understand what needs to be set up
- Available in all server types

### Enhanced `/gensettings`
- **New subcommand:** `remove-alerts-role` - Completely removes the alerts role
- Fixed pinging role system - now properly updates when changed
- Better server-specific permission handling

## Server Setup Process

### For New Regular Servers

1. **Bot joins server automatically**
2. **Welcome message sent** with setup instructions
3. **Server admin runs `/serverinfo`** to check current status
4. **Configure channels** using `/gensettings setchannel`:
   - `alerts` - For new game announcements
   - `bot` - For bot command usage
   - `logs` - For bot activity logs
   - `requests` - For game requests
   - `updated` - For game update notifications

5. **Set up roles** using `/gensettings`:
   - `addpremiumrole` - Roles with higher usage limits
   - `addadminrole` - Roles with unlimited access
   - `addmoderatorrole` - Roles with unlimited access

6. **Configure usage limits** using `/gensettings setusagelimit`

7. **Set alerts role** using `/gensettings alerts-role` for new game notifications

### For Existing Servers

- Run `/serverinfo` to see current configuration
- Use `/gensettings` to modify any settings
- The bot will automatically adapt to the new multi-server system

## Security Features

### Command Restrictions
- **Safe Server:** All commands available
- **Main Server:** Core commands + admin settings
- **Regular Servers:** Basic commands + essential admin settings

### Permission System
- **Bot Owner:** Full access everywhere
- **Server Admins:** Can configure their server
- **Regular Users:** Limited to basic commands

### Channel Restrictions
- Commands can be restricted to specific channels
- Usage tracking per server
- Role-based access control

## Troubleshooting

### Pinging Role Not Working
1. Check if the role exists in the server
2. Verify the role has permission to be mentioned
3. Use `/gensettings remove-alerts-role` then set it again
4. Ensure the bot has permission to mention the role

### Commands Not Available
1. Run `/serverinfo` to see available commands
2. Check if you're in the right server type
3. Verify your permissions in the server

### Setup Issues
1. Ensure you have Administrator permissions
2. Check if the bot has necessary permissions
3. Verify channel IDs are correct
4. Use `/serverinfo` to diagnose configuration problems

## Database Changes

The bot now stores server-specific settings in the `settings` collection with the following structure:

```json
{
  "guildId": "server_id",
  "lang": "en",
  "alertsChannel": "channel_id",
  "logChannel": "channel_id",
  "requestChannel": "channel_id",
  "allowedChannelId": "channel_id",
  "updatedGameChannel": "channel_id",
  "alertsRole": "role_id_or_everyone",
  "premiumRoleIds": ["role_id1", "role_id2"],
  "adminRoleIds": ["role_id1"],
  "moderatorRoleIds": ["role_id1"],
  "usageLimits": {
    "role_id": { "dailyLimit": 50 }
  }
}
```

## Migration Notes

- Existing servers will automatically work with the new system
- No data migration required
- Settings are preserved and enhanced
- New features are automatically available

## Support

For issues or questions:
1. Check `/serverinfo` output
2. Review this documentation
3. Contact the bot owner
4. Check bot logs for errors

## Future Enhancements

- Server-specific language settings
- Advanced role management
- Usage analytics per server
- Automated server health checks
- Enhanced moderation tools
