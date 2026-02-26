'use client';

import { useEffect, useState } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { GameCard } from '@/components/GameCard';
import { StatsCard } from '@/components/StatsCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { ActivityFeed } from '@/components/ActivityFeed';
import { TrendingGames } from '@/components/TrendingGames';
import { Gamepad2, Database, Package, TrendingUp } from 'lucide-react';
import type { StatsOverview } from '@/lib/types';

/**
 * Wrapper that only renders if at least one child feed has data.
 * Avoids a massive blank gap when both ActivityFeed and TrendingGames are empty.
 */
function LiveCommunitySection() {
    const [hasActivity, setHasActivity] = useState<boolean | null>(null); // null = loading

    useEffect(() => {
        fetch('/api/stats/activity')
            .then(r => r.json())
            .then(d => setHasActivity(d.success && d.data?.length > 0))
            .catch(() => setHasActivity(false));
    }, []);

    // While checking, render nothing (avoids flash of empty space)
    if (hasActivity === null) return null;
    // No activity yet — hide entirely
    if (!hasActivity) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="lg:col-span-2">
                <ActivityFeed />
            </div>
            <div className="lg:col-span-1">
                <TrendingGames />
            </div>
        </div>
    );
}

export default function HomePage() {
    const [stats, setStats] = useState<StatsOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/stats/overview')
            .then((res) => res.json())
            .then((data) => {
                if (data.success) setStats(data.data);
                else setError(data.error || 'Failed to load stats');
            })
            .catch(() => setError('Network error'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative pt-16 pb-20 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600/10 border border-brand-500/20 rounded-full text-brand-400 text-sm font-medium mb-8 animate-fade-in">
                        <Gamepad2 className="w-4 h-4" />
                        SB Manifest Dashboard
                    </div>

                    <h1 className="text-4xl sm:text-6xl font-extrabold text-white mb-6 animate-slide-up">
                        Browse & Manage{' '}
                        <span className="gradient-text">Game Manifests</span>
                    </h1>

                    <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 animate-slide-up">
                        Search any Steam game by AppID or name. View depot data, DLC statistics,
                        download manifest files, and trigger regenerations — all from the browser.
                    </p>

                    <div className="max-w-xl mx-auto animate-slide-up">
                        <SearchBar autoFocus placeholder="Enter AppID (e.g., 730) or game name..." />
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="px-4 pb-16">
                <div className="max-w-7xl mx-auto">
                    {loading ? (
                        <div className="mt-8">
                            {/* Loading Skeletons */}
                            <h2 className="section-title opacity-50">Recently Added Games</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <SkeletonCard key={i} />
                                ))}
                            </div>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-gray-400">{error}</p>
                            <p className="text-sm text-gray-500 mt-2">Make sure your environments are configured properly.</p>
                        </div>
                    ) : stats ? (
                        <>
                            {/* Stats cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
                                <StatsCard label="Total Games" value={stats.totalGames} icon={Gamepad2} color="brand" />
                                <StatsCard label="Depots Tracked" value={stats.totalDepotsTracked} icon={Database} color="green" />
                                <StatsCard label="DLCs Tracked" value={stats.totalDlcsTracked} icon={Package} color="yellow" />
                                <StatsCard label="Avg Completion" value={`${stats.averageCompletion}%`} icon={TrendingUp} color="brand" />
                            </div>

                            {/* Vivid Community Section — only shows when there is activity */}
                            <LiveCommunitySection />

                            {/* Recently Updated Games */}
                            {stats.recentlyUpdated.length > 0 && (
                                <div>
                                    <h2 className="section-title">Recently Added Games</h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {stats.recentlyUpdated.map((game) => (
                                            <GameCard
                                                key={game.appId}
                                                appId={game.appId}
                                                name={game.name}
                                                headerImage={game.headerImage}
                                                isAvailable={true}
                                                completionPercent={game.completionPercent}
                                                totalDlc={game.totalDlc}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
