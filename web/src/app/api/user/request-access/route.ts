import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const discordId = session.user.id;
        await dbConnect();

        const updatedUser = await User.findOneAndUpdate(
            {
                discordId,
                $or: [
                    { accessStatus: 'unrequested' },
                    { accessStatus: { $exists: false } }
                ]
            },
            { $set: { accessStatus: 'pending' } },
            { new: true }
        );

        if (!updatedUser) {
            // Check why it wasn't modified
            const existingUser = await User.findOne({ discordId });
            if (!existingUser) {
                return NextResponse.json({ success: false, error: 'User not found in database.' }, { status: 404 });
            }
            return NextResponse.json({
                success: false,
                error: `Cannot request access. Status is already '${existingUser.accessStatus}'`
            }, { status: 400 });
        }

        return NextResponse.json({ success: true, accessStatus: updatedUser.accessStatus });
    } catch (error: any) {
        console.error('Request Access Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
