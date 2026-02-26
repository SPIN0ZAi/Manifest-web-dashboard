'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Sparkles } from 'lucide-react';

interface TrendingGame {
    _id: string; // gameName
    appId: string;
    count: number;
}

export function TrendingGames() {
    const [trending, setTrending] = useState<TrendingGame[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/stats/trending')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setTrending(data.data);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="glass-card p-6 flex justify-center items-center h-[420px]">
                <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
            </div>
        );
    }

    if (trending.length === 0) {
        return null;
    }

    return (
        <div className="glass-card overflow-hidden flex flex-col border-purple-500/20 h-[420px]">
            <div className="p-5 border-b border-white/5 bg-gradient-to-r from-purple-500/10 to-transparent flex items-center gap-3">
                <div className="p-2 rounded-lg bg-surface-300 shadow-inner">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Trending Searches</h3>
            </div>

            <div className="p-4 flex-1">
                <div className="flex flex-col gap-3">
                    {trending.map((game, index) => (
                        <Link
                            key={game._id || index}
                            href={game.appId ? `/app/${game.appId}` : `/search?q=${encodeURIComponent(game._id)}`}
                            className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/0 to-purple-500/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />

                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]' :
                                index === 1 ? 'bg-gray-300/20 text-gray-300 border border-gray-300/30' :
                                    index === 2 ? 'bg-orange-700/20 text-orange-400 border border-orange-700/30' :
                                        'bg-surface-300 text-gray-500'
                                }`}>
                                #{index + 1}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-white truncate group-hover:text-purple-400 transition-colors">
                                    {game._id}
                                </h4>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {game.count} interactions this week
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
