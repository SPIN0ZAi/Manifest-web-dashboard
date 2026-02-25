import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        // Strictly require Admin access
        if (!session?.user || (session.user as any).role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
        }

        await dbConnect();

        // Fetch users, sorted by pending first, then newest
        const users = await User.find({})
            .select('discordId username avatar accessStatus role createdAt')
            .sort({ accessStatus: -1, createdAt: -1 }) // simple sort, you might need programmatic sort if enum string sorting isn't what you want
            .lean();

        // Let's sort programmatically to put "pending" at the top
        const statusWeight: Record<string, number> = {
            'pending': 0,
            'approved': 1,
            'rejected': 2,
            'unrequested': 3
        };

        const sortedUsers = users.sort((a, b) => {
            const weightA = statusWeight[a.accessStatus] ?? 4;
            const weightB = statusWeight[b.accessStatus] ?? 4;
            if (weightA !== weightB) return weightA - weightB;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return NextResponse.json({ success: true, users: sortedUsers });
    } catch (error: any) {
        console.error('Admin Users API Error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
