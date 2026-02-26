'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    Download, RefreshCw, FileCode, Loader2, ArrowLeft, ExternalLink,
    AlertTriangle, Sparkles, CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import type { GameData } from '@/lib/types';

import { HeroBanner } from './HeroBanner';
import { GameTabs } from './GameTabs';
import { DepotTree } from './DepotTree';
import { DlcAccordion } from './DlcAccordion';
import { HowToInstall } from './HowToInstall';

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
    const [trackLoading, setTrackLoading] = useState(false);

    const trackedAppIds = (session?.user as any)?.trackedAppIds || [];
    const isTracked = trackedAppIds.includes(String(appid));

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
        if (!session) { signIn('discord'); return; }
        setTrackLoading(true);
        try {
            const res = await fetch('/api/user/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appId: appid, action: isTracked ? 'untrack' : 'track' })
            });
            const data = await res.json();
            if (data.success) await updateSession();
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

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            </div>
        );
    }

    // Error state
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
    const trackedContent = contentDlcs.filter((d) => d.isTracked);

    // -- Tab content builders --

    const depotsTab = (
        <DepotTree depots={game.depots} gameName={game.name} appId={game.appId} />
    );

    const dlcTab = (
        <DlcAccordion
            dlcList={game.dlcList || []}
            contentDlcCount={game.contentDlcCount}
            trackedContentDlc={trackedContent.length}
            dlcCompletionPercent={game.dlcCompletionPercent}
        />
    );

    const luaTab = (
        <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-brand-400" /> Lua Manifest
            </h3>
            {game.luaContent ? (
                <pre className="code-block text-xs max-h-[600px] overflow-auto whitespace-pre">
                    {game.luaContent}
                </pre>
            ) : (
                <p className="text-gray-500 text-sm text-center py-12">No Lua manifest available for this game.</p>
            )}
        </div>
    );

    const branchTab = (
        <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-brand-400" /> Branch Files ({game.files.length})
            </h3>
            {game.files.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {game.files.map((file) => (
                        <div key={file.name} className="flex items-center gap-3 px-3 py-2.5 bg-surface-200 rounded-xl text-sm hover:bg-surface-300 transition-colors">
                            <span className="text-gray-300 truncate flex-1 font-mono text-xs">{file.name}</span>
                            <span className="text-gray-500 text-xs whitespace-nowrap">
                                {file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(1)} KB`}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 text-sm text-center py-12">No branch files found.</p>
            )}
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
            {/* Back button */}
            <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
            </Link>

            {/* Hero Banner */}
            <HeroBanner game={game} appid={appid} />

            {/* How to Install Guide */}
            {inDatabase && <HowToInstall gameName={game.name} appId={game.appId} />}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
                {/* Track button */}
                <button
                    onClick={handleTrack}
                    disabled={trackLoading}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${isTracked
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30 hover:bg-brand-500/30'
                        : 'bg-surface-200/80 text-white border border-white/10 hover:bg-surface-300'
                        }`}
                >
                    {trackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : isTracked ? <CheckCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4 text-gray-400" />}
                    {isTracked ? 'Tracking' : 'Track Game'}
                </button>

                <a href={`https://store.steampowered.com/app/${appid}`} target="_blank" rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 text-sm">
                    <ExternalLink className="w-4 h-4" /> Steam
                </a>

                {/* Action buttons — only if in database */}
                {inDatabase && (
                    <>
                        <button onClick={() => handleAction('regenerate')} disabled={!!actionLoading}
                            className="btn-primary flex items-center gap-2 text-sm">
                            {actionLoading === 'regenerate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Request Update
                        </button>
                        <button onClick={() => handleAction('sync')} disabled={!!actionLoading}
                            className="btn-secondary flex items-center gap-2 text-sm">
                            {actionLoading === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
                            Regenerate Lua
                        </button>
                        <a href={`/api/app/${appid}/download`} className="btn-secondary flex items-center gap-2 text-sm">
                            <Download className="w-4 h-4" /> Download ZIP
                        </a>
                    </>
                )}
            </div>

            {actionMessage && (
                <div className="glass-card p-4 mb-4 border-brand-500/30">
                    <p className="text-brand-400 text-sm">{actionMessage}</p>
                </div>
            )}

            {/* Notes */}
            {game.notes.length > 0 && (
                <div className="glass-card p-5 mb-4">
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

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Depots</p>
                    <p className="text-xl font-bold gradient-text">{game.totalDepots}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">With Manifests</p>
                    <p className="text-xl font-bold text-green-400">{game.depotsWithManifests}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Shared</p>
                    <p className="text-xl font-bold text-yellow-400">{game.sharedDepots}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Coverage</p>
                    <p className="text-xl font-bold gradient-text">{game.depotCompletionPercent}%</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Content DLCs</p>
                    <p className="text-xl font-bold text-purple-400">{game.contentDlcCount}</p>
                </div>
                <div className="glass-card p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">DLC Tracked</p>
                    <p className={`text-xl font-bold ${game.dlcCompletionPercent >= 80 ? 'text-green-400' : game.dlcCompletionPercent >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {game.trackedContentDlc}/{game.contentDlcCount}
                    </p>
                </div>
            </div>

            {/* Description */}
            {game.shortDescription && (
                <div className="glass-card p-5 mb-2">
                    <p className="text-sm text-gray-400 leading-relaxed">{game.shortDescription}</p>
                </div>
            )}

            {/* Tabbed Content */}
            <GameTabs
                depotsTab={depotsTab}
                dlcTab={dlcTab}
                luaTab={luaTab}
                branchTab={branchTab}
                depotCount={game.depots.length}
                dlcCount={game.totalDlc}
                fileCount={game.files.length}
                hasLua={!!game.luaContent}
            />
        </div>
    );
}
