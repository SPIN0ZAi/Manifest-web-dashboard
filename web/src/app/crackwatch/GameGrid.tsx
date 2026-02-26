'use client';

import { useState } from 'react';
import { ShieldAlert, Calendar, User, Search } from 'lucide-react';

export function GameGrid({ initialGames }: { initialGames: any[] }) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredGames = initialGames.filter((game) =>
        game.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (game.cracker && game.cracker.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (game.drm && game.drm.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex flex-col gap-6">
            {/* Search Bar */}
            <div className="relative max-w-xl mb-4">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    className="block w-full pl-11 pr-4 py-3 bg-surface-200 border border-white/10 rounded-2xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                    placeholder="Search for a game, cracker, or protection..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredGames.length > 0 ? (
                    filteredGames.map((item: any) => {
                        const isCracked = item.status === 'cracked';
                        const statusColor = isCracked ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30';
                        const badgeBg = isCracked ? 'bg-green-500/10' : 'bg-red-500/10';

                        return (
                            <div
                                key={item.id || item._id}
                                className="group bg-surface hover:bg-surface-100 rounded-2xl border border-white/5 transition-all duration-300 overflow-hidden flex flex-col relative"
                            >
                                {/* Thumbnail */}
                                <div className="h-44 w-full relative overflow-hidden bg-surface-200">
                                    <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent z-10" />
                                    {item.image ? (
                                        <img
                                            src={item.image}
                                            alt={item.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : null}

                                    {/* Status Badge */}
                                    <div className={`absolute top-3 right-3 z-20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md border ${badgeBg} ${statusColor}`}>
                                        {item.status}
                                    </div>
                                </div>

                                <div className="p-5 flex-1 flex flex-col z-10">
                                    <h2 className="text-lg font-bold text-white mb-2 line-clamp-2" title={item.title}>
                                        {item.title}
                                    </h2>

                                    <div className="flex flex-col gap-2 mt-2 mb-4">
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <ShieldAlert className="w-4 h-4 text-brand-400" />
                                            <span className="truncate" title={item.drm}>{item.drm}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <Calendar className="w-4 h-4" />
                                            <span>Rel: {item.releaseDate && !isNaN(Date.parse(item.releaseDate)) ? new Date(item.releaseDate).toLocaleDateString() : (item.releaseDate || 'Unknown')}</span>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-sm">
                                        {isCracked ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 text-green-400/80 font-medium">
                                                    <User className="w-4 h-4" />
                                                    <span className="truncate max-w-[120px]" title={item.cracker}>{item.cracker}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-red-400/80 font-medium text-xs uppercase tracking-wide">
                                                Not Cracked Yet
                                            </div>
                                        )}

                                        {item.crackDate && (
                                            <div className="text-xs text-gray-500 font-mono">
                                                {new Date(item.crackDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="col-span-full py-12 text-center text-gray-400 bg-surface/50 rounded-2xl border border-white/5">
                        No games found matching your search.
                    </div>
                )}
            </div>
        </div>
    );
}
