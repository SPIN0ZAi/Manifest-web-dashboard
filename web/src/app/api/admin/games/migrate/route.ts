import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models/Game';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Strictly require Admin access
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const filePath = path.join(process.cwd(), 'src', 'lib', 'data', 'denuvo.json');
        let fileContents = fs.readFileSync(filePath, 'utf8');

        if (fileContents.charCodeAt(0) === 0xfeff) {
            fileContents = fileContents.slice(1);
        }
        fileContents = fileContents.replace(/^\uFFFD+/g, '').replace(/[^\x20-\x7E\s]/g, '');

        const denuvoData = JSON.parse(fileContents);
        const games = denuvoData.games;

        await dbConnect();

        let count = 0;
        for (const item of games) {
            // Upsert each game based on its ID
            await Game.findOneAndUpdate(
                { id: item.id },
                {
                    $set: {
                        title: item.title,
                        status: item.status,
                        releaseDate: item.releaseDate,
                        drm: item.drm || 'Unknown',
                        image: item.image || '',
                        cracker: item.cracker,
                        crackDate: item.crackDate,
                        notes: item.notes
                    }
                },
                { upsert: true, new: true }
            );
            count++;
        }

        return NextResponse.json({ success: true, message: `Successfully migrated ${count} games.` });
    } catch (error: any) {
        console.error('Games Migration API Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error', details: error.message }, { status: 500 });
    }
}
