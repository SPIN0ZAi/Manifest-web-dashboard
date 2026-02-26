'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { GameCard } from '@/components/GameCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { Search, Loader2 } from 'lucide-react';
import type { SearchResult } from '@/lib/types';

function SearchContent() {
    const searchParams = useSearchParams();
    const query = searchParams.get('q') || '';
    const [results, setResults] = useState<(SearchResult & { isAvailable?: boolean })[]>([]);
    const [depotData, setDepotData] = useState<Record<number, number>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!query) return;
        setLoading(true);
        setError('');

        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then((res) => res.json())
            .then(async (data) => {
                if (data.success) {
                    setResults(data.data.results);
                    // Batch check depot availability
                    const checks = await Promise.allSettled(
                        data.data.results.slice(0, 12).map(async (r: SearchResult) => {
                            const res = await fetch(`/api/manifest/check?appId=${r.appId}`);
                            const json = await res.json();
                            return { appId: r.appId, depotCount: json.depotCount || 0 };
                        })
                    );
                    const depots: Record<number, number> = {};
                    checks.forEach((c) => {
                        if (c.status === 'fulfilled') depots[c.value.appId] = c.value.depotCount;
                    });
                    setDepotData(depots);
                } else {
                    setError(data.error || 'Search failed');
                }
            })
            .catch(() => setError('Network error'))
            .finally(() => setLoading(false));
    }, [query]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="max-w-2xl mx-auto mb-12">
                <h1 className="text-3xl font-bold text-white mb-2 text-center">
                    <Search className="w-8 h-8 inline-block mr-3 text-brand-400" />
                    Search Games
                </h1>
                <p className="text-gray-400 text-center mb-8">
                    Search by Steam AppID or game name
                </p>
                <SearchBar autoFocus placeholder="Enter AppID (e.g., 730) or game name..." />
            </div>

            {query && (
                <div className="mb-6">
                    <p className="text-sm text-gray-400">
                        {loading ? 'Searching...' : `Results for "${query}" (${results.length} found)`}
                    </p>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonCard key={i} />
                    ))}
                </div>
            ) : error ? (
                <div className="text-center py-20">
                    <p className="text-gray-400">{error}</p>
                </div>
            ) : results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
                    {results.map((result) => (
                        <GameCard
                            key={result.appId}
                            appId={result.appId}
                            name={result.name}
                            headerImage={result.headerImage}
                            isAvailable={result.isAvailable}
                            price={result.price}
                            depotCount={depotData[result.appId]}
                        />
                    ))}
                </div>
            ) : query ? (
                <div className="text-center py-20">
                    <p className="text-gray-400">No results found for &ldquo;{query}&rdquo;</p>
                    <p className="text-sm text-gray-500 mt-2">Try searching by AppID number or a different name</p>
                </div>
            ) : null}
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>}>
            <SearchContent />
        </Suspense>
    );
}

