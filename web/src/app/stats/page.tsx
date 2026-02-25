'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/StatsCard';
import { Gamepad2, Database, Package, TrendingUp, BarChart3, Loader2 } from 'lucide-react';
import type { StatsOverview } from '@/lib/types';

export default function StatsPage() {
    const [stats, setStats] = useState<StatsOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/stats/overview')
            .then((res) => res.json())
            .then((data) => { if (data.success) setStats(data.data); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-400">Failed to load statistics</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 animate-fade-in">
            <div className="mb-12">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
                    <BarChart3 className="w-8 h-8 text-brand-400" />
                    DLC Statistics Dashboard
                </h1>
                <p className="text-gray-400">Aggregated data across all tracked games</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                <StatsCard label="Total Games" value={stats.totalGames} icon={Gamepad2} color="brand" />
                <StatsCard label="Depots Tracked" value={stats.totalDepotsTracked} icon={Database} color="green" />
                <StatsCard label="DLCs Tracked" value={stats.totalDlcsTracked} icon={Package} color="yellow" />
                <StatsCard label="Avg Completion" value={`${stats.averageCompletion}%`} icon={TrendingUp} color="brand" />
            </div>

            {/* Top Games by DLC */}
            {stats.topGamesByDlc.length > 0 && (
                <div className="glass-card p-6 mb-8">
                    <h2 className="text-lg font-semibold text-white mb-6">Top Games by DLC Count</h2>
                    <div className="space-y-3">
                        {stats.topGamesByDlc.map((game, index) => {
                            const maxDlc = stats.topGamesByDlc[0]?.dlcCount || 1;
                            const barWidth = (game.dlcCount / maxDlc) * 100;
                            return (
                                <a
                                    key={game.appId}
                                    href={`/app/${game.appId}`}
                                    className="flex items-center gap-4 group hover:bg-white/5 rounded-xl px-3 py-2 transition-colors"
                                >
                                    <span className="text-sm font-mono text-gray-500 w-6">{index + 1}</span>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-gray-200 group-hover:text-brand-400 transition-colors">
                                                {game.name}
                                            </span>
                                            <span className="text-xs text-gray-500">{game.dlcCount} DLCs</span>
                                        </div>
                                        <div className="w-full h-2 bg-surface-300 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-700"
                                                style={{ width: `${barWidth}%` }}
                                            />
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recently Updated Grid */}
            {stats.recentlyUpdated.length > 0 && (
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-white mb-6">Recently Updated Games</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 uppercase border-b border-white/5">
                                    <th className="text-left py-3 pr-4">Game</th>
                                    <th className="text-center py-3 px-4">AppID</th>
                                    <th className="text-center py-3 px-4">DLCs</th>
                                    <th className="text-center py-3 px-4">Completion</th>
                                    <th className="text-left py-3">Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentlyUpdated.map((game) => (
                                    <tr key={game.appId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="py-3 pr-4">
                                            <a href={`/app/${game.appId}`} className="text-gray-200 hover:text-brand-400 transition-colors font-medium">
                                                {game.name}
                                            </a>
                                        </td>
                                        <td className="py-3 px-4 text-center font-mono text-gray-400">{game.appId}</td>
                                        <td className="py-3 px-4 text-center text-gray-400">{game.totalDlc}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`font-medium ${game.completionPercent >= 90 ? 'text-green-400' : game.completionPercent >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {game.completionPercent}%
                                            </span>
                                        </td>
                                        <td className="py-3 text-xs text-gray-500">{game.updateTime}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
