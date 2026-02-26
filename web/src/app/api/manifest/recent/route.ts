import { NextResponse } from 'next/server';
import { getRecentlyUpdatedBranches, getGameJson } from '@/lib/github';
import { getSteamAppDetails } from '@/lib/steam';

/**
 * GET /api/manifest/recent
 * Returns the 10 most recently updated manifest entries from the GitHub database.
 * Uses getRecentlyUpdatedBranches from github.ts and resolves game names.
 */
export async function GET() {
    try {
        const recentBranches = await getRecentlyUpdatedBranches(10);

        const results = await Promise.allSettled(
            recentBranches.map(async (branch) => {
                const json = await getGameJson(branch);
                const name = json?.name || `App ${branch}`;
                const steamData = await getSteamAppDetails(Number(branch));
                return {
                    appId: branch,
                    name,
                    headerImage: steamData?.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${branch}/header.jpg`,
                    updateTime: json?.update_time || '',
                };
            })
        );

        const games = results
            .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
            .map(r => r.value);

        return NextResponse.json({ success: true, data: games });
    } catch (err) {
        console.error('Recent manifests error:', err);
        return NextResponse.json({ success: false, data: [] });
    }
}
