import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/mongodb';
import { Activity } from '@/lib/db/models/Activity';

export const revalidate = 10; // Cache for 10 seconds

export async function GET() {
    try {
        await dbConnect();

        // Fetch the 15 most recent activities
        const recentActivity = await Activity.find({})
            .sort({ createdAt: -1 })
            .limit(15)
            .lean();

        return NextResponse.json({ success: true, data: recentActivity });
    } catch (error: any) {
        console.error('Fetch Activity Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
