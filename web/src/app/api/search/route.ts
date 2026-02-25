import { NextResponse } from 'next/server';
import { searchSteamGames } from '@/lib/steam';
import { branchExists } from '@/lib/github';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
        return NextResponse.json(
            { success: false, error: 'Search query is required.' },
            { status: 400 }
        );
    }

    try {
        // If query is numeric, check if it's a valid AppID in our database
        if (/^\d+$/.test(query.trim())) {
            const appId = query.trim();
            const exists = await branchExists(appId);

            // Also search Steam for the name
            const steamResults = await searchSteamGames(appId);
            const result = steamResults.find((r) => r.appId === parseInt(appId));

            return NextResponse.json({
                success: true,
                data: {
                    results: result
                        ? [{ ...result, isAvailable: exists }]
                        : [{ appId: parseInt(appId), name: `App ${appId}`, headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`, type: 'Unknown', isAvailable: exists, isReleased: true, isFreeApp: false, price: 'N/A' }],
                    query: appId,
                    isAppIdSearch: true,
                },
            });
        }

        // Search by name via Steam API
        const results = await searchSteamGames(query.trim());

        // Check which games are in our database (check first 10 to avoid rate limits)
        const enrichedResults = await Promise.all(
            results.slice(0, 10).map(async (result) => {
                const exists = await branchExists(String(result.appId));
                return { ...result, isAvailable: exists };
            })
        );

        // Add remaining results without db check
        const remaining = results.slice(10).map((r) => ({ ...r, isAvailable: false }));

        return NextResponse.json({
            success: true,
            data: {
                results: [...enrichedResults, ...remaining],
                query: query.trim(),
                isAppIdSearch: false,
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json(
            { success: false, error: 'Search failed. Please try again.' },
            { status: 500 }
        );
    }
}
