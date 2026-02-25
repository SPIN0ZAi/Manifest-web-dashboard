import { NextResponse } from 'next/server';
import { getTotalBranchCount, getGameJson } from '@/lib/github';
import { getSteamAppDetails } from '@/lib/steam';
import { parseGameDepots } from '@/lib/manifest-parser';
import type { StatsOverview, RecentGame } from '@/lib/types';
import { Octokit } from '@octokit/rest';

export const maxDuration = 30;

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const OWNER = process.env.GITHUB_REPO_OWNER || 'SPIN0ZAi';
const REPO = process.env.GITHUB_REPO_NAME || 'SB_manifest_DB';

/**
 * Get the most recently created/updated branches using the GitHub Events API.
 * This returns branches that were actually pushed to recently.
 */
async function getRecentBranchesFromEvents(count: number): Promise<string[]> {
    const branches: string[] = [];
    const seen = new Set<string>();

    try {
        // Fetch multiple pages of events to get enough recent branches
        for (let page = 1; page <= 3 && branches.length < count; page++) {
            const { data: events } = await octokit.activity.listRepoEvents({
                owner: OWNER,
                repo: REPO,
                per_page: 100,
                page,
            });

            for (const event of events) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const payload = event.payload as any;

                let branchName = '';

                if (event.type === 'CreateEvent' && payload?.ref_type === 'branch') {
                    // Branch creation event — ref is the branch name
                    branchName = payload.ref || '';
                } else if (event.type === 'PushEvent') {
                    // Push event — ref is like "refs/heads/1234567"
                    const ref = payload?.ref || '';
                    branchName = ref.replace('refs/heads/', '');
                }

                // Only include numeric branch names (AppIDs)
                if (branchName && /^\d+$/.test(branchName) && !seen.has(branchName)) {
                    seen.add(branchName);
                    branches.push(branchName);
                    if (branches.length >= count) break;
                }
            }
        }
    } catch (err) {
        console.error('Events API error:', err);
    }

    return branches;
}

export async function GET() {
    try {
        const totalGames = await getTotalBranchCount();

        // Get actually recently updated branches from GitHub events
        const recentBranches = await getRecentBranchesFromEvents(12);

        let totalDlcsTracked = 0;
        let totalDepotsTracked = 0;
        let totalCompletion = 0;
        let gamesWithData = 0;
        const recentlyUpdated: RecentGame[] = [];

        // Fetch game details for each recent branch
        const results = await Promise.allSettled(
            recentBranches.map(async (appId) => {
                const [json, steamData] = await Promise.all([
                    getGameJson(appId).catch(() => null),
                    getSteamAppDetails(appId).catch(() => null),
                ]);
                return { appId, json, steamData };
            })
        );

        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { appId, json, steamData } = result.value;

            let depotCompletion = 100;
            let totalDepots = 0;

            if (json) {
                const parsed = parseGameDepots(json);
                totalDepotsTracked += parsed.totalDepots;
                totalDepots = parsed.totalDepots;
                depotCompletion = parsed.totalDepots > 0
                    ? Math.round((parsed.depotsWithManifests / parsed.totalDepots) * 10000) / 100
                    : 100;
            }

            const dlcCount = steamData?.dlc?.length || 0;
            totalDlcsTracked += dlcCount;
            totalCompletion += depotCompletion;
            gamesWithData++;

            recentlyUpdated.push({
                appId: parseInt(appId),
                name: steamData?.name || json?.name || `App ${appId}`,
                updateTime: json?.update_time || '',
                headerImage: steamData?.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
                completionPercent: depotCompletion,
                totalDlc: dlcCount,
            });
        }

        const overview: StatsOverview = {
            totalGames,
            totalDlcsTracked,
            totalDepotsTracked,
            averageCompletion: gamesWithData > 0
                ? Math.round((totalCompletion / gamesWithData) * 100) / 100
                : 0,
            recentlyUpdated,
            topGamesByDlc: recentlyUpdated
                .filter((g) => g.totalDlc > 0)
                .sort((a, b) => b.totalDlc - a.totalDlc)
                .slice(0, 10)
                .map((g) => ({ name: g.name, appId: g.appId, dlcCount: g.totalDlc })),
        };

        return NextResponse.json({ success: true, data: overview });
    } catch (error) {
        console.error('Stats overview error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch statistics.' },
            { status: 500 }
        );
    }
}
