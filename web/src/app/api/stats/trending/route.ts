import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/mongodb';
import { Activity } from '@/lib/db/models/Activity';

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
    try {
        await dbConnect();

        // Aggregate most frequent appIds/gameNames searched/viewed in the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const trending = await Activity.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo },
                    actionType: { $in: ['search', 'view', 'download_manifest'] },
                    $and: [
                        { gameName: { $exists: true, $ne: null } },
                        { gameName: { $ne: '' } }
                    ]
                }
            },
            {
                $group: {
                    _id: "$gameName",
                    count: { $sum: 1 },
                    appId: { $first: "$appId" } // Keep the first associated appId found
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        return NextResponse.json({ success: true, data: trending });
    } catch (error: any) {
        console.error('Trending Activity Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
