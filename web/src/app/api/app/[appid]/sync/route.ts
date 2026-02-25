import { NextResponse } from 'next/server';
import { getLuaContent, getBranchFiles, branchExists, updateFileInBranch } from '@/lib/github';
import { getSteamAppDetails } from '@/lib/steam';

/**
 * POST /api/app/[appid]/sync
 * 
 * Regenerates the Lua file for a game by:
 * 1. Reading the current Lua from the GitHub branch
 * 2. Fetching the latest Steam data (depots, DLC list)
 * 3. Adding any missing DLC addappid() entries
 * 4. Pushing the updated Lua back to GitHub
 */
export async function POST(
    request: Request,
    { params }: { params: { appid: string } }
) {
    const { appid } = params;

    if (!/^\d+$/.test(appid)) {
        return NextResponse.json({ success: false, error: 'Invalid AppID' }, { status: 400 });
    }

    try {
        // Check if the branch exists
        const exists = await branchExists(appid);
        if (!exists) {
            return NextResponse.json({
                success: false,
                error: `Branch ${appid} does not exist. Add the game first.`,
            }, { status: 404 });
        }

        // Fetch current state in parallel
        const [currentLua, steamData, files] = await Promise.all([
            getLuaContent(appid),
            getSteamAppDetails(appid),
            getBranchFiles(appid),
        ]);

        if (!currentLua) {
            return NextResponse.json({
                success: false,
                error: 'No Lua file found in branch. Cannot regenerate.',
            }, { status: 400 });
        }

        const gameName = steamData?.name || `App ${appid}`;
        const steamDlcIds: number[] = steamData?.dlc || [];

        // Parse existing Lua to find what's already tracked
        const existingAppIds = new Set<string>();
        const addappidRegex = /addappid\s*\(\s*(\d+)/g;
        let match;
        while ((match = addappidRegex.exec(currentLua)) !== null) {
            existingAppIds.add(match[1]);
        }

        // Find DLC AppIDs that are NOT in the current Lua
        const missingDlcIds: number[] = [];
        for (const dlcId of steamDlcIds) {
            if (!existingAppIds.has(String(dlcId))) {
                missingDlcIds.push(dlcId);
            }
        }

        if (missingDlcIds.length === 0) {
            return NextResponse.json({
                success: true,
                message: `Lua is already up to date. All ${steamDlcIds.length} DLCs are tracked.`,
                changes: 0,
            });
        }

        // Fetch names for missing DLCs
        const dlcNames = new Map<number, string>();
        const batchSize = 5;
        for (let i = 0; i < missingDlcIds.length; i += batchSize) {
            const batch = missingDlcIds.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(async (id) => {
                    try {
                        const res = await fetch(
                            `https://store.steampowered.com/api/appdetails?appids=${id}&l=english`
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
                    dlcNames.set(result.value.id, result.value.name);
                }
            }
        }

        // Build the new Lua content: append missing DLCs
        let updatedLua = currentLua.trimEnd();

        // Add a DLC section if there are missing DLCs
        updatedLua += '\n\n-- DLCS WITHOUT DEDICATED DEPOTS\n';
        for (const dlcId of missingDlcIds) {
            const name = dlcNames.get(dlcId) || `DLC ${dlcId}`;
            updatedLua += `addappid(${dlcId}) -- ${name}\n`;
        }

        // Also check: does the main app Lua have addtoken for the main app?
        // If not, we can add it (though we may not have the token value)

        // Update the header timestamp
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZoneName: 'short'
        });

        // Update the "Updated:" line if it exists, or add it
        if (updatedLua.includes('-- Updated:')) {
            updatedLua = updatedLua.replace(/-- Updated:.*/, `-- Updated: ${dateStr}`);
        } else if (updatedLua.includes('-- Name:')) {
            updatedLua = updatedLua.replace(
                /(-- Name:.*)/,
                `$1\n-- Updated: ${dateStr}`
            );
        }

        // Push to GitHub
        const result = await updateFileInBranch(
            appid,
            `${appid}.lua`,
            updatedLua,
            `Regenerate Lua: added ${missingDlcIds.length} missing DLC(s) for ${gameName}`
        );

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: `Failed to push to GitHub: ${result.error}`,
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `✅ Added ${missingDlcIds.length} missing DLC(s) to ${gameName}'s Lua and pushed to GitHub.`,
            changes: missingDlcIds.length,
            addedDlcs: missingDlcIds.map((id) => ({
                appId: id,
                name: dlcNames.get(id) || `DLC ${id}`,
            })),
        });
    } catch (error) {
        console.error(`Sync error for AppID ${appid}:`, error);
        return NextResponse.json(
            { success: false, error: 'Failed to regenerate Lua. Check server logs.' },
            { status: 500 }
        );
    }
}
