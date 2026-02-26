import { NextResponse } from 'next/server';
import { branchExists, getGameJson } from '@/lib/github';

/**
 * GET /api/manifest/check?appId=X
 * Lightweight check if a game has manifests in the GitHub database.
 * Returns: { hasManifest, depotCount }
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId');

    if (!appId) {
        return NextResponse.json({ hasManifest: false, depotCount: 0 });
    }

    try {
        const exists = await branchExists(appId);
        if (!exists) {
            return NextResponse.json({ hasManifest: false, depotCount: 0 });
        }

        const json = await getGameJson(appId);
        if (!json) {
            return NextResponse.json({ hasManifest: true, depotCount: 0 });
        }

        // Count depots that have manifests
        const depots = json.depot || {};
        let depotCount = 0;
        for (const [key, val] of Object.entries(depots)) {
            if (/^\d+$/.test(key) && val && typeof val === 'object' && (val as any).manifests?.public?.gid) {
                depotCount++;
            }
        }

        return NextResponse.json({ hasManifest: true, depotCount });
    } catch {
        return NextResponse.json({ hasManifest: false, depotCount: 0 });
    }
}
