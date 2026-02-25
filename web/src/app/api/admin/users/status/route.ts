import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Strictly require Admin access
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        const body = await req.json();
        const { discordId, status } = body;

        if (!discordId || !['approved', 'rejected', 'pending', 'unrequested'].includes(status)) {
            return NextResponse.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
        }

        // Prevent admin from locking themselves out (safety check)
        if (discordId === '302125862340526120' && status !== 'approved') {
            return NextResponse.json({ success: false, error: 'Cannot alter root admin status' }, { status: 400 });
        }

        await dbConnect();

        const updatedUser = await User.findOneAndUpdate(
            { discordId },
            { $set: { accessStatus: status } },
            { new: true }
        ).lean();

        if (!updatedUser) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, user: updatedUser });
    } catch (error: any) {
        console.error('Admin Users Status API Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
