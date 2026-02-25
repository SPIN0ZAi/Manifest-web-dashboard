import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';
import { getSteamAppDetails } from '@/lib/steam';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const discordId = session.user.id;
        await dbConnect();

        const dbUser = await User.findOne({ discordId }).lean();
        if (!dbUser || !dbUser.trackedAppIds || dbUser.trackedAppIds.length === 0) {
            return NextResponse.json({
                success: true,
                trackedGames: []
            });
        }

        // Fetch meta details for the tracked games
        const gamePromises = dbUser.trackedAppIds.map(async (appId: string) => {
            try {
                const gameData = await getSteamAppDetails(appId);
                return {
                    appId,
                    name: gameData?.name || `Unknown Game (${appId})`,
                    headerImage: gameData?.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
                };
            } catch {
                return {
                    appId,
                    name: `Unknown Game (${appId})`,
                    headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
                };
            }
        });

        const trackedGames = await Promise.all(gamePromises);

        return NextResponse.json({
            success: true,
            trackedGames
        });

    } catch (error: any) {
        console.error('Profile API Error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
