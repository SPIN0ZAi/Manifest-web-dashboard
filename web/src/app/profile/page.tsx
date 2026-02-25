'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { GameCard } from '@/components/GameCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { User, Bookmark, LogIn, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface TrackedGame {
    appId: string;
    name: string;
    headerImage: string;
}

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const [trackedGames, setTrackedGames] = useState<TrackedGame[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (status === 'authenticated') {
            fetch('/api/profile')
                .then(res => res.json())
                .then(data => {
                    if (data.success) setTrackedGames(data.trackedGames);
                    else setError(data.error);
                })
                .catch(() => setError('Failed to load profile data.'))
                .finally(() => setLoading(false));
        } else if (status === 'unauthenticated') {
            setLoading(false);
        }
    }, [status]);

    if (status === 'loading') {
        return (
            <div className="min-h-[80vh] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <div className="max-w-4xl mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="w-20 h-20 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <LogIn className="w-10 h-10 text-brand-400" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-4">You are not logged in</h1>
                <p className="text-gray-400 mb-8 max-w-md mx-auto">
                    Log in with Discord to start building your own tracked games watchlist, automatically receive updates, and more.
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-12 animate-fade-in">
            {/* Header Section */}
            <div className="glass-card p-8 mb-12 flex flex-col md:flex-row items-center gap-6">
                {session?.user?.image ? (
                    <img
                        src={session.user.image}
                        alt="Profile Picture"
                        className="w-24 h-24 rounded-full border-4 border-surface shadow-xl shadow-brand-500/10"
                    />
                ) : (
                    <div className="w-24 h-24 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center border-4 border-surface">
                        <User className="w-10 h-10" />
                    </div>
                )}

                <div className="text-center md:text-left">
                    <h1 className="text-3xl font-bold text-white mb-2">Welcome, {session?.user?.name}</h1>
                    <div className="flex items-center gap-2 text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-lg border border-brand-500/20 w-fit mx-auto md:mx-0">
                        <Bookmark className="w-4 h-4" />
                        <span className="text-sm font-medium">{trackedGames.length} Tracked Games</span>
                    </div>
                </div>
            </div>

            {/* Watchlist Section */}
            <div>
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                    Your Watchlist
                </h2>

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonCard key={i} />
                        ))}
                    </div>
                ) : error ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400 text-center">
                        {error}
                    </div>
                ) : trackedGames.length === 0 ? (
                    <div className="bg-surface-100 border border-white/5 rounded-2xl p-12 text-center text-gray-400">
                        <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-4 opacity-50" />
                        <p className="mb-6">You haven't tracked any games yet.</p>
                        <Link href="/search" className="btn-primary inline-flex">
                            Find Games to Track
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {trackedGames.map((game) => (
                            <GameCard
                                key={game.appId}
                                appId={Number(game.appId)}
                                name={game.name}
                                headerImage={game.headerImage}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
