import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models/Game';

// GET — List all games
export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        await dbConnect();
        const games = await Game.find({}).sort({ createdAt: -1 }).lean();

        return NextResponse.json({ success: true, games });
    } catch (error: any) {
        console.error('Admin Games GET Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

// PUT — Update a game by _id
export async function PUT(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { _id, ...updates } = body;

        if (!_id) {
            return NextResponse.json({ success: false, error: 'Missing game _id' }, { status: 400 });
        }

        if (updates.status && !['cracked', 'uncracked'].includes(updates.status)) {
            return NextResponse.json({ success: false, error: 'Invalid status value' }, { status: 400 });
        }

        await dbConnect();

        const updatedGame = await Game.findByIdAndUpdate(
            _id,
            { $set: updates },
            { new: true }
        ).lean();

        if (!updatedGame) {
            return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, game: updatedGame });
    } catch (error: any) {
        console.error('Admin Games PUT Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE — Delete a game by _id
export async function DELETE(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const _id = searchParams.get('id');

        if (!_id) {
            return NextResponse.json({ success: false, error: 'Missing game id' }, { status: 400 });
        }

        await dbConnect();

        const deleted = await Game.findByIdAndDelete(_id).lean();

        if (!deleted) {
            return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Game deleted' });
    } catch (error: any) {
        console.error('Admin Games DELETE Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
