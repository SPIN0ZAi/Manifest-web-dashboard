import { NextResponse } from 'next/server';
import { getGameJson, getLuaContent, getBranchFiles, branchExists } from '@/lib/github';
import { getSteamAppDetails } from '@/lib/steam';
import { parseGameDepots, generateNotes } from '@/lib/manifest-parser';
import type { GameData, DlcInfo, DlcType } from '@/lib/types';
import dbConnect from '@/lib/db/mongodb';
import { Activity } from '@/lib/db/models/Activity';

/**
 * Keywords that indicate a DLC is NOT a real content DLC.
 * These are extras like soundtracks, cosmetics, art books, etc.
 */
const EXTRA_DLC_KEYWORDS = [
    'soundtrack', 'ost', 'original score', 'music',
    'cosmetic', 'skin', 'costume', 'outfit', 'appearance',
    'art book', 'artbook', 'art of', 'digital art',
    'wallpaper', 'desktop',
    'pre-order', 'preorder', 'pre order', 'bonus pack',
    'supporter pack', 'supporter bundle',
    'digital deluxe', 'digital upgrade',
    'credits', 'making of', 'behind the scenes',
];

function classifyDlc(dlcName: string): DlcType {
    const lower = dlcName.toLowerCase();
    for (const keyword of EXTRA_DLC_KEYWORDS) {
        if (lower.includes(keyword)) return 'extra';
    }
    return 'content';
}

/**
 * Parse a Lua file to extract all AppIDs referenced via addappid() calls.
 * This is how we determine which DLCs are "tracked" — if the DLC's AppID
 * appears as addappid(dlcId) in the parent game's Lua, it's tracked.
 */
function extractTrackedAppIdsFromLua(luaContent: string): Set<number> {
    const ids = new Set<number>();
    // Match addappid(1234567) with or without extra params
    const regex = /addappid\s*\(\s*(\d+)/g;
    let match;
    while ((match = regex.exec(luaContent)) !== null) {
        ids.add(parseInt(match[1]));
    }
    return ids;
}

/**
 * Batch fetch DLC names from Steam Store API.
 */
async function fetchDlcNames(dlcIds: number[]): Promise<Map<number, string>> {
    const names = new Map<number, string>();
    const batchSize = 5;
    for (let i = 0; i < dlcIds.length; i += batchSize) {
        const batch = dlcIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(async (id) => {
                try {
                    const res = await fetch(
                        `https://store.steampowered.com/api/appdetails?appids=${id}&l=english`,
                        { next: { revalidate: 3600 } }
                    );
                    if (!res.ok) return { id, name: null };
                    const data = await res.json();
                    const entry = data[String(id)];
                    return { id, name: entry?.data?.name || null };
                } catch {
                    return { id, name: null };
                }
            })
        );
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.name) {
                names.set(result.value.id, result.value.name);
            }
        }
    }
    return names;
}

export async function GET(
    request: Request,
    { params }: { params: { appid: string } }
) {
    const { appid } = params;

    if (!/^\d+$/.test(appid)) {
        return NextResponse.json(
            { success: false, error: 'Invalid AppID format. Must be numeric.' },
            { status: 400 }
        );
    }

    try {
        const [exists, steamData] = await Promise.all([
            branchExists(appid),
            getSteamAppDetails(appid),
        ]);

        const steamDlcIds: number[] = steamData?.dlc || [];

        if (!exists) {
            if (steamData) {
                const dlcNames = steamDlcIds.length > 0
                    ? await fetchDlcNames(steamDlcIds.slice(0, 50))
                    : new Map<number, string>();

                const dlcList: DlcInfo[] = steamDlcIds.map((id) => {
                    const name = dlcNames.get(id) || `DLC ${id}`;
                    return { appId: id, name, isTracked: false, hasOwnDepot: false, dlcType: classifyDlc(name) };
                });
                const contentDlcCount = dlcList.filter((d) => d.dlcType === 'content').length;

                return NextResponse.json({
                    success: true,
                    data: buildGameDataFromSteam(appid, steamData, steamDlcIds, dlcList, contentDlcCount),
                    inDatabase: false,
                });
            }
            return NextResponse.json(
                { success: false, error: 'Game not found on Steam or in database.' },
                { status: 404 }
            );
        }

        // Fetch from GitHub
        const [gameJson, luaContent, files] = await Promise.all([
            getGameJson(appid),
            getLuaContent(appid),
            getBranchFiles(appid),
        ]);

        const depotData = gameJson ? parseGameDepots(gameJson) : buildDepotDataFromFiles(files, luaContent || '');

        // === DLC TRACKING — HYBRID APPROACH ===
        // 1. Check if DLC AppID appears in the parent game's Lua file (addappid(dlcId))
        // 2. Fall back to checking if the DLC has its own branch in the repo
        // This covers both cases: games where Lua has DLC entries, and games where DLCs have separate branches
        const trackedAppIds = extractTrackedAppIdsFromLua(luaContent || '');

        const dlcList: DlcInfo[] = [];
        let trackedDlc = 0;
        let trackedContentDlc = 0;

        if (steamDlcIds.length > 0) {
            const dlcNames = await fetchDlcNames(steamDlcIds.slice(0, 50));

            // Check Lua first, then branch existence as fallback (in parallel for speed)
            const dlcChecks = await Promise.allSettled(
                steamDlcIds.slice(0, 50).map(async (dlcId) => {
                    // First check: is the DLC in the parent Lua?
                    const inLua = trackedAppIds.has(dlcId);
                    // Second check: does the DLC have its own branch? (only if not in Lua)
                    const hasBranch = inLua ? false : await branchExists(String(dlcId));
                    const isTracked = inLua || hasBranch;
                    const hasOwnDepot = gameJson?.depot?.[String(dlcId)] !== undefined;
                    return { dlcId, isTracked, hasOwnDepot, inLua, hasBranch };
                })
            );

            for (const result of dlcChecks) {
                if (result.status === 'fulfilled') {
                    const { dlcId, isTracked, hasOwnDepot } = result.value;
                    const name = dlcNames.get(dlcId) || `DLC ${dlcId}`;
                    const dlcType = classifyDlc(name);

                    if (isTracked) {
                        trackedDlc++;
                        if (dlcType === 'content') trackedContentDlc++;
                    }

                    dlcList.push({ appId: dlcId, name, isTracked, hasOwnDepot, dlcType });
                }
            }

            // Add remaining unchecked DLCs (>50)
            for (let i = 50; i < steamDlcIds.length; i++) {
                const name = `DLC ${steamDlcIds[i]}`;
                dlcList.push({
                    appId: steamDlcIds[i], name, isTracked: false, hasOwnDepot: false, dlcType: 'content',
                });
            }
        }

        const totalDlc = steamDlcIds.length;
        const contentDlcCount = dlcList.filter((d) => d.dlcType === 'content').length;
        const extraDlcCount = dlcList.filter((d) => d.dlcType === 'extra').length;
        const missingDlc = totalDlc - trackedDlc;

        const dlcCompletionPercent = contentDlcCount > 0
            ? Math.round((trackedContentDlc / contentDlcCount) * 10000) / 100
            : 100;

        const depotCompletionPercent = depotData.totalDepots > 0
            ? Math.round((depotData.depotsWithManifests / depotData.totalDepots) * 10000) / 100
            : 100;

        const notes = gameJson
            ? generateNotes(depotData.depots, steamDlcIds, depotData.missingManifests)
            : ['ℹ️ No JSON metadata file — data built from Steam API + branch files'];

        if (totalDlc > 0) {
            if (contentDlcCount > 0) {
                notes.push(`📦 ${contentDlcCount} content DLC(s) — ${trackedContentDlc} tracked in Lua`);
            }
            if (extraDlcCount > 0) {
                const trackedExtras = dlcList.filter((d) => d.dlcType === 'extra' && d.isTracked).length;
                notes.push(`🎵 ${extraDlcCount} extra(s) — ${trackedExtras} tracked in Lua`);
            }
        }

        const gameData: GameData = {
            appId: parseInt(appid),
            name: steamData?.name || gameJson?.name || `App ${appid}`,
            type: steamData?.type || gameJson?.type || 'Game',
            isFreeApp: steamData?.is_free ?? (gameJson?.isfreeapp === 0),
            updateTime: gameJson?.update_time || '',
            changeNumber: gameJson?.change_number || 0,
            headerImage: steamData?.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
            shortDescription: steamData?.short_description || '',
            depots: depotData.depots,
            totalDepots: depotData.totalDepots,
            depotsWithManifests: depotData.depotsWithManifests,
            sharedDepots: depotData.sharedDepots,
            dlcAppIds: steamDlcIds,
            dlcList,
            totalDlc,
            contentDlcCount,
            extraDlcCount,
            trackedDlc,
            trackedContentDlc,
            missingDlc,
            dlcCompletionPercent,
            depotCompletionPercent,
            invalidEntries: 0,
            missingList: depotData.missingManifests,
            notes,
            luaContent: luaContent || '',
            files,
            genres: steamData?.genres?.map((g) => g.description) || [],
            releaseDate: steamData?.release_date?.date || gameJson?.update_time || 'Unknown',
            isReleased: steamData ? !steamData.release_date?.coming_soon : true,
            price: steamData?.is_free ? 'Free' : steamData?.price_overview?.final_formatted || 'N/A',
        };

        // Fire-and-forget activity log for vivid homepage
        dbConnect().then(() => {
            Activity.create({
                actionType: 'view',
                appId: appid,
                gameName: gameData.name
            }).catch(console.error);
        }).catch(console.error);

        return NextResponse.json({ success: true, data: gameData, inDatabase: true });
    } catch (error) {
        console.error(`API error for AppID ${appid}:`, error);
        return NextResponse.json(
            { success: false, error: 'Internal server error. Please try again.' },
            { status: 500 }
        );
    }
}

function buildGameDataFromSteam(
    appid: string,
    steamData: NonNullable<Awaited<ReturnType<typeof getSteamAppDetails>>>,
    dlcIds: number[],
    dlcList: DlcInfo[],
    contentDlcCount: number
): GameData {
    return {
        appId: parseInt(appid),
        name: steamData.name,
        type: steamData.type,
        isFreeApp: steamData.is_free,
        updateTime: '',
        changeNumber: 0,
        headerImage: steamData.header_image,
        shortDescription: steamData.short_description,
        depots: [],
        totalDepots: 0,
        depotsWithManifests: 0,
        sharedDepots: 0,
        dlcAppIds: dlcIds,
        dlcList,
        totalDlc: dlcIds.length,
        contentDlcCount,
        extraDlcCount: dlcIds.length - contentDlcCount,
        trackedDlc: 0,
        trackedContentDlc: 0,
        missingDlc: dlcIds.length,
        dlcCompletionPercent: 0,
        depotCompletionPercent: 0,
        invalidEntries: 0,
        missingList: [],
        notes: ['⚠️ Game not yet in manifest database'],
        luaContent: '',
        files: [],
        genres: steamData.genres?.map((g) => g.description) || [],
        releaseDate: steamData.release_date?.date || 'Unknown',
        isReleased: !steamData.release_date?.coming_soon,
        price: steamData.is_free ? 'Free' : steamData.price_overview?.final_formatted || 'N/A',
    };
}

function buildDepotDataFromFiles(
    files: { name: string; size: number; type: string }[],
    luaContent: string
) {
    interface DepotFromFile {
        depotId: string;
        manifestId: string | null;
        size: string | null;
        downloadSize: string | null;
        oslist: string | null;
        language: string | null;
        isShared: boolean;
        sharedFromApp: string | null;
        isOptional: boolean;
        hasDecryptionKey: boolean;
    }

    const depots: DepotFromFile[] = [];
    const seen = new Set<string>();

    for (const file of files) {
        if (file.name.endsWith('.manifest')) {
            const match = file.name.match(/^(\d+)_(\d+)\.manifest$/);
            if (match) {
                const depotId = match[1];
                if (!seen.has(depotId)) {
                    seen.add(depotId);
                    depots.push({
                        depotId,
                        manifestId: match[2],
                        size: null,
                        downloadSize: null,
                        oslist: null,
                        language: null,
                        isShared: false,
                        sharedFromApp: null,
                        isOptional: false,
                        hasDecryptionKey: false,
                    });
                }
            }
        }
    }

    return {
        depots,
        totalDepots: depots.length,
        depotsWithManifests: depots.filter((d) => d.manifestId).length,
        sharedDepots: depots.filter((d) => d.isShared).length,
        dlcAppIds: [] as number[],
        missingManifests: depots.filter((d) => !d.manifestId).map((d) => d.depotId),
    };
}
