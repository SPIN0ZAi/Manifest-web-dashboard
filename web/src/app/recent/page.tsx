'use client';

import { useEffect, useState } from 'react';
import { GameCard } from '@/components/GameCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ArrowLeft, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface RecentGame {
    appId: string;
    name: string;
    headerImage: string;
    updateTime: string;
}

export default function RecentPage() {
    const [games, setGames] = useState<RecentGame[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRecent = () => {
        setLoading(true);
        fetch('/api/manifest/recent')
            .then(res => res.json())
            .then(data => {
                if (data.success) setGames(data.data);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchRecent(); }, []);

    return (
        <div className="max-w-7xl mx-auto px-4 py-12">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
            </Link>

            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Clock className="w-8 h-8 text-brand-400" />
                        Recently Updated Manifests
                    </h1>
                    <p className="text-gray-400 mt-2">Games whose manifest files were recently added or updated</p>
                </div>
                <button
                    onClick={fetchRecent}
                    disabled={loading}
                    className="btn-secondary flex items-center gap-2 text-sm"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : games.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 animate-fade-in">
                    {games.map((game) => (
                        <GameCard
                            key={game.appId}
                            appId={Number(game.appId)}
                            name={game.name}
                            headerImage={game.headerImage}
                            isAvailable={true}
                            updateTime={game.updateTime}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20">
                    <p className="text-gray-400">No recent manifest updates found.</p>
                </div>
            )}
        </div>
    );
}
