import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models/Game';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Strictly require Admin access
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        let { steamAppId, title, image, status, releaseDate, drm, cracker, crackDate, notes } = body;

        // Validation
        if (!status || !['cracked', 'uncracked'].includes(status)) {
            return NextResponse.json({ success: false, error: 'Invalid or missing status' }, { status: 400 });
        }
        if (!steamAppId && !title) {
            return NextResponse.json({ success: false, error: 'Must provide either Steam App ID or Title' }, { status: 400 });
        }

        // Fetch from Steam if steamAppId is provided
        if (steamAppId) {
            try {
                const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}`);
                if (steamRes.ok) {
                    const steamData = await steamRes.json();
                    if (steamData[steamAppId]?.success && steamData[steamAppId]?.data) {
                        const gameData = steamData[steamAppId].data;
                        if (!title) title = gameData.name;
                        if (!image) image = gameData.header_image || gameData.capsule_image;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch from Steam API:", err);
                // Non-fatal, will just use whatever title/image was provided
            }
        }

        if (!title) {
            return NextResponse.json({ success: false, error: 'Failed to fetch title from Steam, please provide manually' }, { status: 400 });
        }

        // Generate ID from Title
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

        await dbConnect();

        const newGame = await Game.findOneAndUpdate(
            { id },
            {
                $set: {
                    steamAppId,
                    title,
                    status,
                    image,
                    releaseDate,
                    drm: drm || 'Unknown',
                    cracker,
                    crackDate,
                    notes
                }
            },
            { new: true, upsert: true }
        ).lean();

        return NextResponse.json({ success: true, game: newGame });
    } catch (error: any) {
        console.error('Admin Games Import API Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
