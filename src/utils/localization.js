import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './database.js';

export const locales = new Map();

// Load all `<lang>.json` files from `/locales`
function loadLocales() {
  const localesPath = path.join(process.cwd(), 'locales');
  const files = fs.readdirSync(localesPath).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const lang = file.replace(/\.json$/, '');
    const data = fs.readFileSync(path.join(localesPath, file), 'utf8');
    locales.set(lang, JSON.parse(data));
  }
  console.log(`Loaded ${locales.size} locales: ${[...locales.keys()].join(', ')}`);
}

// Helpers to get/set per‑guild language
async function getGuildSettings(guildId) {
  const db = await getDb();
  return db.collection('settings').findOne({ guildId });
}

export async function setServerLanguage(guildId, lang) {
  if (!locales.has(lang)) {
    throw new Error(`Language '${lang}' is not supported.`);
  }
  const db = await getDb();
  await db.collection('settings').updateOne(
    { guildId },
    { $set: { lang } },
    { upsert: true }
  );
}

// Returns the two‑letter code ('en', 'ar', etc.)
export async function getLanguage(guildId) {
  if (!guildId) return 'en';
  const settings = await getGuildSettings(guildId);
  return settings?.lang || 'en';
}

// Safe nested lookup in a JSON object by dot‑path
export function getNested(obj, key) {
  if (!obj) return undefined;
  return key.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
}

// The translation function: t('KEY.PATH', guildId, { replacements })
export async function t(key, guildId, replacements = {}) {
  const lang = await getLanguage(guildId);
  // Try desired locale, then fallback to English
  let translation = getNested(locales.get(lang), key)
    || getNested(locales.get('en'), key);

  if (typeof translation !== 'string') {
    console.warn(`No translation found for key: ${key}`);
    return key;
  }

  // Simple `{placeholder}` replacement
  for (const [ph, val] of Object.entries(replacements)) {
    translation = translation.replaceAll(`{${ph}}`, String(val));
  }
  return translation;
}

// Immediately load locale files on startup
loadLocales();
