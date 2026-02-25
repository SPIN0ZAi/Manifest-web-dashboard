'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, AlertCircle, Gamepad2 } from 'lucide-react';

interface GameCardProps {
    appId: number;
    name: string;
    headerImage: string;
    isAvailable?: boolean;
    completionPercent?: number;
    totalDlc?: number;
    updateTime?: string;
    price?: string;
}

export function GameCard({
    appId,
    name,
    headerImage,
    isAvailable = false,
    completionPercent,
    totalDlc,
    updateTime,
    price,
}: GameCardProps) {
    const [imgFailed, setImgFailed] = useState(false);

    return (
        <Link href={`/app/${appId}`} className="block group">
            <div className="glass-card-hover overflow-hidden">
                {/* Image */}
                <div className="relative aspect-[460/215] overflow-hidden">
                    {imgFailed ? (
                        <div className="w-full h-full bg-gradient-to-br from-surface-200 via-surface-300 to-brand-500/10 flex items-center justify-center">
                            <div className="text-center">
                                <Gamepad2 className="w-10 h-10 text-gray-600 mx-auto mb-1" />
                                <span className="text-xs text-gray-500 font-mono">{appId}</span>
                            </div>
                        </div>
                    ) : (
                        <Image
                            src={headerImage}
                            alt={name}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={() => setImgFailed(true)}
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-100 via-transparent to-transparent" />

                    {/* Availability badge */}
                    <div className="absolute top-3 right-3">
                        {isAvailable ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs font-medium rounded-lg backdrop-blur-sm border border-green-500/20">
                                <CheckCircle className="w-3 h-3" />
                                Available
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs font-medium rounded-lg backdrop-blur-sm border border-yellow-500/20">
                                <AlertCircle className="w-3 h-3" />
                                Not in DB
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-brand-400 transition-colors">
                        {name}
                    </h3>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">AppID: {appId}</span>
                        {price && (
                            <span className="text-xs font-medium text-brand-400">{price}</span>
                        )}
                    </div>

                    {/* Stats row */}
                    {(completionPercent !== undefined || totalDlc !== undefined) && (
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
                            {completionPercent !== undefined && (
                                <div className="flex items-center gap-1.5">
                                    <div className="w-16 h-1.5 bg-surface-300 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500"
                                            style={{ width: `${Math.min(completionPercent, 100)}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-400">{completionPercent}%</span>
                                </div>
                            )}
                            {totalDlc !== undefined && totalDlc > 0 && (
                                <span className="text-xs text-gray-500">{totalDlc} DLC</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
}
