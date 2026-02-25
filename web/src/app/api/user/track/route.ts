import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const discordId = session.user.id;
        const body = await req.json();
        const { appId, action } = body;

        if (!appId || !['track', 'untrack'].includes(action)) {
            return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
        }

        await dbConnect();

        // Convert appId to string for consistent storage
        const appIdStr = String(appId);

        let updateOp = {};
        if (action === 'track') {
            updateOp = { $addToSet: { trackedAppIds: appIdStr } };
        } else {
            updateOp = { $pull: { trackedAppIds: appIdStr } };
        }

        const updatedUser = await User.findOneAndUpdate(
            { discordId },
            updateOp,
            { new: true, upsert: true }
        );

        return NextResponse.json({
            success: true,
            trackedAppIds: updatedUser.trackedAppIds
        });

    } catch (error: any) {
        console.error('Track API Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
