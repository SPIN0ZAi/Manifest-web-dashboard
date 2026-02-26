import { ShieldCheck } from 'lucide-react';
import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models/Game';
import { GameGrid } from './GameGrid';

export const revalidate = 60; // Cache invalidation

export default async function NewsPage() {
    await dbConnect();

    // Fetch games from MongoDB, sort by most recently created/updated
    const news = await Game.find({}).sort({ createdAt: -1 }).lean();

    return (
        <div className="min-h-screen bg-surface-50 pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Crackwatch</h1>
                            <p className="text-gray-400 mt-1">Status of popular DRM protected games</p>
                        </div>
                    </div>
                </div>

                <GameGrid initialGames={JSON.parse(JSON.stringify(news))} />
            </div>
        </div>
    );
}
