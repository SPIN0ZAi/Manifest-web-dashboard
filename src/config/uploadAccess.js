import 'dotenv/config';
import { PermissionFlagsBits } from 'discord.js';

const DEFAULT_EXTRA_UPLOAD_GUILD_IDS = ['1373031969386008729'];
const DEFAULT_EXTRA_UPLOAD_USER_IDS = ['588896596742373398'];

function parseCsvIds(value) {
    return (value || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
}

function unique(ids) {
    return [...new Set(ids.filter(Boolean))];
}

export const UPLOAD_COMMAND_NAMES = ['upload', 'uploadzip', 'uploadzipbulk'];

const envExtraGuildIds = parseCsvIds(process.env.UPLOAD_ALLOWED_GUILD_IDS || process.env.EXTRA_UPLOAD_GUILD_IDS);
const envExtraUserIds = parseCsvIds(process.env.UPLOAD_ALLOWED_USER_IDS || process.env.EXTRA_UPLOAD_USER_IDS);

export const UPLOAD_ALLOWED_GUILD_IDS = unique([
    process.env.SAFE_GUILD_ID,
    ...DEFAULT_EXTRA_UPLOAD_GUILD_IDS,
    ...envExtraGuildIds,
]);

export const UPLOAD_ALLOWED_USER_IDS = unique([
    process.env.BOT_OWNER_ID,
    ...DEFAULT_EXTRA_UPLOAD_USER_IDS,
    ...envExtraUserIds,
]);

export function isUploadGuildAllowed(guildId) {
    return !!guildId && UPLOAD_ALLOWED_GUILD_IDS.includes(guildId);
}

export function isUploadUserAllowed(userId) {
    return !!userId && UPLOAD_ALLOWED_USER_IDS.includes(userId);
}

export function canUseUploadCommands(interaction) {
    if (isUploadUserAllowed(interaction.user?.id)) return true;
    return !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}
