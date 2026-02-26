import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db/mongodb';
import { Activity } from '@/lib/db/models/Activity';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { actionType, appId, gameName, discordId, username, metadata } = body;

        if (!actionType) {
            return NextResponse.json({ success: false, error: 'actionType is required' }, { status: 400 });
        }

        await dbConnect();

        const activity = new Activity({
            actionType,
            appId,
            gameName,
            discordId,
            username,
            metadata
        });

        await activity.save();

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Activity Log Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
