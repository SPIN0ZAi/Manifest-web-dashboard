'use client';

import Image from 'next/image';
import { useState } from 'react';
import { HardDrive, Package, FileCode, Calendar, Tag } from 'lucide-react';
import type { GameData } from '@/lib/types';

interface HeroBannerProps {
    game: GameData;
    appid: string;
}

export function HeroBanner({ game, appid }: HeroBannerProps) {
    const [bgFailed, setBgFailed] = useState(false);
    const [thumbFailed, setThumbFailed] = useState(false);
    // Use the standard header image (works for all games) as primary
    const bgUrl = game.headerImage;
    // Try capsule for the thumbnail but fallback to header
    const thumbUrl = thumbFailed ? game.headerImage : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
    const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

    return (
        <div className="relative w-full rounded-2xl overflow-hidden mb-8" style={{ minHeight: '280px' }}>
            {/* Blurred Background */}
            {!bgFailed && (
                <Image
                    src={bgUrl}
                    alt=""
                    fill
                    className="object-cover scale-110"
                    style={{ filter: 'blur(30px) brightness(0.4)' }}
                    onError={() => setBgFailed(true)}
                    priority
                    sizes="100vw"
                />
            )}
            {bgFailed && (
                <div className="absolute inset-0 bg-gradient-to-br from-surface-300 via-surface-200 to-brand-900/20" />
            )}

            {/* Dark Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />

            {/* Content */}
            <div className="relative z-10 flex items-end p-8 min-h-[280px]">
                {/* Capsule Thumbnail */}
                <div className="hidden sm:block flex-shrink-0 mr-8">
                    <div className="relative w-[140px] h-[200px] rounded-xl overflow-hidden shadow-2xl border border-white/10">
                        {!bgFailed ? (
                            <Image
                                src={thumbUrl}
                                alt={game.name}
                                fill
                                className="object-cover"
                                sizes="140px"
                                onError={() => setThumbFailed(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-surface-300 flex items-center justify-center">
                                <span className="text-white/20 text-xs font-bold text-center px-2">{game.name}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-3 leading-tight drop-shadow-lg">
                        {game.name}
                    </h1>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300 mb-4">
                        <span className="font-mono text-gray-400">AppID: {game.appId}</span>
                        <span className="text-gray-600">•</span>
                        <span>{game.type}</span>
                        {releaseYear && !isNaN(releaseYear) && (
                            <>
                                <span className="text-gray-600">•</span>
                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{releaseYear}</span>
                            </>
                        )}
                        <span className="text-gray-600">•</span>
                        <span>{game.price}</span>
                        {!game.isReleased && (
                            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs font-bold rounded-full border border-yellow-500/30">
                                🔒 Unreleased
                            </span>
                        )}
                    </div>

                    {/* Genre tags */}
                    {game.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {game.genres.slice(0, 6).map((genre) => (
                                <span key={genre} className="flex items-center gap-1 px-2.5 py-1 bg-white/10 backdrop-blur text-xs text-gray-200 rounded-full border border-white/5">
                                    <Tag className="w-3 h-3" />{genre}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-2">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/15 border border-brand-500/25 rounded-lg text-xs font-semibold text-brand-400">
                            <HardDrive className="w-3.5 h-3.5" />{game.depotsWithManifests}/{game.totalDepots} Depots
                        </span>
                        {game.totalDlc > 0 && (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 border border-purple-500/25 rounded-lg text-xs font-semibold text-purple-400">
                                <Package className="w-3.5 h-3.5" />{game.totalDlc} DLC
                            </span>
                        )}
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${game.luaContent
                            ? 'bg-green-500/15 border-green-500/25 text-green-400'
                            : 'bg-gray-500/15 border-gray-500/25 text-gray-400'
                            }`}>
                            <FileCode className="w-3.5 h-3.5" />{game.luaContent ? 'Has Lua ✓' : 'No Lua'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
