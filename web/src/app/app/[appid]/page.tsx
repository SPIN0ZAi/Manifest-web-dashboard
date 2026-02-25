'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    Download, RefreshCw, GitBranch, FileCode, HardDrive, Key, Globe,
    CheckCircle, AlertTriangle, Package, Loader2, ArrowLeft, ExternalLink,
    XCircle, PackageCheck, Music, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useColor } from 'color-thief-react';
import { useSession, signIn } from 'next-auth/react';
import type { GameData } from '@/lib/types';

export default function AppDetailPage() {
    const params = useParams();
    const appid = params.appid as string;
    const { data: session, update: updateSession } = useSession();

    const [game, setGame] = useState<GameData | null>(null);
    const [inDatabase, setInDatabase] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [actionMessage, setActionMessage] = useState('');
    const [showAllDlc, setShowAllDlc] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);
    const [trackLoading, setTrackLoading] = useState(false);

    // Check tracking status
    const trackedAppIds = (session?.user as any)?.trackedAppIds || [];
    const isTracked = trackedAppIds.includes(String(appid));

    // Dynamic color extraction
    const { data: dominantColor } = useColor(
        game?.headerImage && !imgFailed ? game.headerImage : '',
        'hex',
        { crossOrigin: 'anonymous' }
    );

    useEffect(() => {
        if (!appid) return;
        setLoading(true);
        setError('');

        fetch(`/api/app/${appid}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setGame(data.data);
                    setInDatabase(data.inDatabase);
                } else {
                    setError(data.error || 'Game not found');
                }
            })
            .catch(() => setError('Network error'))
            .finally(() => setLoading(false));
    }, [appid]);

    const handleTrack = async () => {
        if (!session) {
            signIn('discord');
            return;
        }

        setTrackLoading(true);
        try {
            const res = await fetch('/api/user/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: appid, action: isTracked ? 'untrack' : 'track' })
            });
            const data = await res.json();
            if (data.success) {
                await updateSession(); // Refresh session to get updated trackedAppIds
            }
        } catch (err) {
            console.error(err);
        } finally {
            setTrackLoading(false);
        }
    };

    const handleAction = async (action: 'regenerate' | 'sync') => {
        setActionLoading(action);
        setActionMessage('');
        try {
            const res = await fetch(`/api/app/${appid}/${action}`, { method: 'POST' });
            const data = await res.json();
            setActionMessage(data.message || (data.success ? 'Action completed!' : 'Action failed.'));
        } catch {
            setActionMessage('Network error');
        } finally {
            setActionLoading('');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
                <h1 className="text-2xl font-bold text-white mb-3">Game Not Found</h1>
                <p className="text-gray-400 mb-6">{error || 'Could not load game data.'}</p>
                <Link href="/" className="btn-primary inline-flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                </Link>
            </div>
        );
    }

    const contentDlcs = game.dlcList?.filter((d) => d.dlcType === 'content') || [];
    const extraDlcs = game.dlcList?.filter((d) => d.dlcType === 'extra') || [];
    const trackedContent = contentDlcs.filter((d) => d.isTracked);
    const trackedExtras = extraDlcs.filter((d) => d.isTracked);
    const allDlc = game.dlcList || [];
    const visibleDlc = showAllDlc ? allDlc : allDlc.slice(0, 24);

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
            {/* Back button */}
            <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
            </Link>

            {/* Game Header */}
            <div className="glass-card overflow-hidden mb-8" style={{
                backgroundColor: dominantColor ? `${dominantColor}15` : undefined,
                borderColor: dominantColor ? `${dominantColor}40` : undefined,
                boxShadow: dominantColor ? `0 10px 40px -10px ${dominantColor}50` : undefined,
                transition: 'all 1s ease'
            }}>
                <div className="relative h-48 sm:h-64">
                    {!imgFailed ? (
                        <Image
                            src={game.headerImage}
                            alt={game.name}
                            fill
                            priority
                            sizes="100vw"
                            className="object-cover"
                            onError={() => setImgFailed(true)}
                        />
                    ) : (
                        <div className="w-full h-full bg-surface-200" />
                    )}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(to top, var(--surface-100) 0%, var(--surface-100) 40%, transparent 100%), linear-gradient(to right, ${dominantColor ? `${dominantColor}80` : 'transparent'} 0%, transparent 100%)`,
                            opacity: 0.9
                        }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                            <div>
                                <h1 className="text-3xl font-bold text-white mb-1">{game.name}</h1>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                                    <span>AppID: {game.appId}</span>
                                    <span>•</span>
                                    <span>{game.type}</span>
                                    <span>•</span>
                                    <span>{game.price}</span>
                                    {!game.isReleased && (
                                        <>
                                            <span>•</span>
                                            <span className="text-yellow-400 font-medium">🔒 Not Released</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleTrack}
                                    disabled={trackLoading}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${isTracked
                                            ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30'
                                            : 'bg-surface-200/80 text-white backdrop-blur border border-white/10 hover:bg-surface-300'
                                        }`}
                                >
                                    {trackLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : isTracked ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <Sparkles className="w-4 h-4 text-gray-400" />
                                    )}
                                    {isTracked ? 'Tracking' : 'Track Game'}
                                </button>
                                <a
                                    href={`https://store.steampowered.com/app/${appid}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-secondary flex items-center gap-2 text-sm backdrop-blur"
                                >
                                    <ExternalLink className="w-4 h-4" /> Steam
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-8">
                <button
                    onClick={() => handleAction('regenerate')}
                    disabled={!!actionLoading}
                    className="btn-primary flex items-center gap-2"
                >
                    {actionLoading === 'regenerate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Request Update
                </button>
                <button
                    onClick={() => handleAction('sync')}
                    disabled={!!actionLoading}
                    className="btn-secondary flex items-center gap-2"
                >
                    {actionLoading === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
                    Regenerate Lua
                </button>
                <a
                    href={`/api/app/${appid}/download`}
                    className="btn-secondary flex items-center gap-2"
                >
                    <Download className="w-4 h-4" /> Download ZIP
                </a>
            </div>

            {actionMessage && (
                <div className="glass-card p-4 mb-8 border-brand-500/30">
                    <p className="text-brand-400 text-sm">{actionMessage}</p>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Depots</p>
                    <p className="text-2xl font-bold gradient-text">{game.totalDepots}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">With Manifests</p>
                    <p className="text-2xl font-bold text-green-400">{game.depotsWithManifests}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Shared Depots</p>
                    <p className="text-2xl font-bold text-yellow-400">{game.sharedDepots}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Depot Coverage</p>
                    <p className="text-2xl font-bold gradient-text">{game.depotCompletionPercent}%</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Content DLCs</p>
                    <p className="text-2xl font-bold text-purple-400">{game.contentDlcCount}</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">DLC Tracked</p>
                    <p className={`text-2xl font-bold ${game.dlcCompletionPercent >= 80 ? 'text-green-400' : game.dlcCompletionPercent >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {game.trackedContentDlc}/{game.contentDlcCount}
                    </p>
                </div>
            </div>

            {/* DLC Completion Bar (only for content DLCs) */}
            {game.contentDlcCount > 0 && (
                <div className="glass-card p-5 mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <PackageCheck className="w-4 h-4 text-purple-400" /> Content DLC Tracking
                        </h3>
                        <span className={`text-lg font-bold ${game.dlcCompletionPercent >= 80 ? 'text-green-400' : game.dlcCompletionPercent >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {game.dlcCompletionPercent}%
                        </span>
                    </div>
                    <div className="w-full h-3 bg-surface-300 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${game.dlcCompletionPercent >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                                game.dlcCompletionPercent >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                                    'bg-gradient-to-r from-red-500 to-rose-400'
                                }`}
                            style={{ width: `${Math.min(game.dlcCompletionPercent, 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                        <span>{trackedContent.length} content DLC(s) tracked</span>
                        <span>{contentDlcs.length - trackedContent.length} missing</span>
                    </div>
                    {extraDlcs.length > 0 && (
                        <p className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                            <Music className="w-3 h-3" />
                            {extraDlcs.length} extra(s) not counted (soundtracks, cosmetics, etc.)
                            {trackedExtras.length > 0 && ` · ${trackedExtras.length} tracked`}
                        </p>
                    )}
                </div>
            )}

            {/* Notes */}
            {game.notes.length > 0 && (
                <div className="glass-card p-5 mb-8">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" /> Notes & Warnings
                    </h3>
                    <ul className="space-y-1.5">
                        {game.notes.map((note, i) => (
                            <li key={i} className="text-sm text-gray-300">{note}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Depot Table */}
                <div className="glass-card p-5 overflow-hidden">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-brand-400" /> Depots ({game.depots.length})
                    </h3>
                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 uppercase border-b border-white/5">
                                    <th className="text-left py-2 pr-4">ID</th>
                                    <th className="text-left py-2 pr-4">Manifest</th>
                                    <th className="text-left py-2 pr-4">Info</th>
                                    <th className="text-center py-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {game.depots.map((depot) => (
                                    <tr key={depot.depotId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="py-2 pr-4 font-mono text-gray-300">{depot.depotId}</td>
                                        <td className="py-2 pr-4 font-mono text-xs text-gray-500 truncate max-w-[140px]">
                                            {depot.manifestId ? depot.manifestId.substring(0, 12) + '...' : '—'}
                                        </td>
                                        <td className="py-2 pr-4 text-xs text-gray-500">
                                            {depot.oslist && <span className="mr-1">{depot.oslist === 'windows' ? '🪟' : depot.oslist === 'linux' ? '🐧' : '🍎'}</span>}
                                            {depot.language && <span className="mr-1">🌐{depot.language}</span>}
                                            {depot.isShared && <span className="text-yellow-400">shared</span>}
                                        </td>
                                        <td className="py-2 text-center">
                                            {depot.manifestId ? (
                                                <CheckCircle className="w-4 h-4 text-green-400 mx-auto" />
                                            ) : depot.isShared ? (
                                                <Globe className="w-4 h-4 text-yellow-400 mx-auto" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-red-400 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Lua Manifest Viewer */}
                <div className="glass-card p-5 overflow-hidden">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-brand-400" /> Lua Manifest
                    </h3>
                    {game.luaContent ? (
                        <pre className="code-block text-xs max-h-96 overflow-auto whitespace-pre">
                            {game.luaContent}
                        </pre>
                    ) : (
                        <p className="text-gray-500 text-sm">No Lua manifest available.</p>
                    )}
                </div>
            </div>

            {/* DLC List */}
            {allDlc.length > 0 && (
                <div className="glass-card p-5 mt-8">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4 text-purple-400" /> DLC List ({game.totalDlc})
                        <span className="ml-auto text-xs font-normal flex items-center gap-3">
                            <span className="text-green-400">{trackedContent.length + trackedExtras.length} tracked</span>
                            <span className="text-gray-500">·</span>
                            <span className="text-purple-400">{contentDlcs.length} content</span>
                            <span className="text-gray-500">·</span>
                            <span className="text-gray-400 flex items-center gap-1"><Music className="w-3 h-3" /> {extraDlcs.length} extras</span>
                        </span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {visibleDlc.map((dlc) => (
                            <Link
                                key={dlc.appId}
                                href={`/app/${dlc.appId}`}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-white/10 ${dlc.isTracked
                                    ? 'bg-green-500/5 border border-green-500/10'
                                    : 'bg-red-500/5 border border-red-500/10'
                                    }`}
                            >
                                {dlc.isTracked ? (
                                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                                ) : (
                                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <span className="text-gray-300 truncate block text-xs">{dlc.name}</span>
                                    <span className="text-[10px] text-gray-600 font-mono">{dlc.appId}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {dlc.dlcType === 'extra' ? (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-500/20 text-gray-400 rounded font-medium flex items-center gap-0.5">
                                            <Sparkles className="w-2.5 h-2.5" /> extra
                                        </span>
                                    ) : (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded font-medium">
                                            content
                                        </span>
                                    )}
                                    {dlc.hasOwnDepot && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded font-medium">
                                            depot
                                        </span>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                    {allDlc.length > 24 && !showAllDlc && (
                        <button
                            onClick={() => setShowAllDlc(true)}
                            className="mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors"
                        >
                            Show all {allDlc.length} DLCs →
                        </button>
                    )}
                </div>
            )}

            {/* Files list */}
            {game.files.length > 0 && (
                <div className="glass-card p-5 mt-8">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Key className="w-4 h-4 text-brand-400" /> Branch Files ({game.files.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {game.files.map((file) => (
                            <div key={file.name} className="flex items-center gap-3 px-3 py-2 bg-surface-200 rounded-lg text-sm">
                                <span className="text-gray-300 truncate flex-1 font-mono text-xs">{file.name}</span>
                                <span className="text-gray-500 text-xs whitespace-nowrap">
                                    {file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(1)} KB`}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Description */}
            {game.shortDescription && (
                <div className="glass-card p-5 mt-8">
                    <h3 className="text-sm font-semibold text-white mb-3">About</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{game.shortDescription}</p>
                    {game.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {game.genres.map((genre) => (
                                <span key={genre} className="px-3 py-1 bg-surface-200 text-xs text-gray-400 rounded-full border border-white/5">
                                    {genre}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
