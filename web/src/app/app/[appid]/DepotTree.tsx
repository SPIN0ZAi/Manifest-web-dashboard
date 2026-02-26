'use client';

import { useState, useCallback } from 'react';
import {
    ChevronRight, FolderOpen, Folder, FileText, Copy, Check,
    Download, Globe, HardDrive, AlertTriangle, CheckCircle
} from 'lucide-react';
import type { DepotInfo } from '@/lib/types';

interface DepotTreeProps {
    depots: DepotInfo[];
    gameName: string;
    appId: number;
}

function formatSize(sizeStr: string | null): string {
    if (!sizeStr) return '';
    const bytes = parseInt(sizeStr, 10);
    if (isNaN(bytes)) return '';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [text]);

    return (
        <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-all group/copy"
            title="Copy manifest ID"
        >
            {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
                <Copy className="w-3.5 h-3.5 text-gray-500 group-hover/copy:text-white transition-colors" />
            )}
        </button>
    );
}

function DepotNode({ depot }: { depot: DepotInfo }) {
    const [expanded, setExpanded] = useState(false);
    const [highlighted, setHighlighted] = useState(false);
    const size = formatSize(depot.size);
    const dlSize = formatSize(depot.downloadSize);
    const hasManifest = !!depot.manifestId;

    const statusColor = hasManifest
        ? 'text-green-400'
        : depot.isShared
            ? 'text-yellow-400'
            : 'text-red-400';

    return (
        <div className="select-none">
            {/* Depot Row */}
            <button
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-white/5 ${expanded ? 'bg-white/5' : ''}`}
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
                {expanded ? (
                    <FolderOpen className="w-4 h-4 text-brand-400 flex-shrink-0" />
                ) : (
                    <Folder className="w-4 h-4 text-brand-400 flex-shrink-0" />
                )}

                <span className="font-mono text-gray-200 text-xs">{depot.depotId}</span>

                {/* OS / Language badges */}
                {depot.oslist && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                        {depot.oslist === 'windows' ? '🪟 Win' : depot.oslist === 'linux' ? '🐧 Linux' : '🍎 Mac'}
                    </span>
                )}
                {depot.language && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                        🌐 {depot.language}
                    </span>
                )}
                {depot.isShared && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        shared
                    </span>
                )}
                {depot.isOptional && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        optional
                    </span>
                )}

                {/* Size */}
                {size && (
                    <span className="ml-auto text-[10px] font-mono text-gray-500 flex-shrink-0">{size}</span>
                )}

                {/* Status dot */}
                <span className={`flex-shrink-0 ${statusColor}`}>
                    {hasManifest ? (
                        <CheckCircle className="w-4 h-4" />
                    ) : depot.isShared ? (
                        <Globe className="w-4 h-4" />
                    ) : (
                        <AlertTriangle className="w-4 h-4" />
                    )}
                </span>
            </button>

            {/* Expanded: Manifest details */}
            {expanded && (
                <div className="ml-10 mt-1 mb-2 animate-fade-in">
                    {hasManifest ? (
                        <div
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer ${highlighted
                                    ? 'bg-brand-500/10 border-brand-500/30'
                                    : 'bg-surface-200/50 border-white/5 hover:border-white/10'
                                }`}
                            onClick={() => setHighlighted(!highlighted)}
                        >
                            <FileText className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                            <span className="font-mono text-xs text-gray-300 flex-1 truncate">{depot.manifestId}</span>
                            <CopyButton text={depot.manifestId!} />
                            {dlSize && (
                                <span className="text-[10px] font-mono text-gray-500">dl: {dlSize}</span>
                            )}
                            {depot.hasDecryptionKey && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                                    🔑 key
                                </span>
                            )}
                        </div>
                    ) : depot.isShared ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-200/50 border border-white/5">
                            <Globe className="w-3.5 h-3.5 text-yellow-400" />
                            <span className="text-xs text-gray-400">
                                Shared from app <span className="font-mono text-gray-300">{depot.sharedFromApp || 'unknown'}</span>
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-xs text-red-400/80">No manifest found</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function DepotTree({ depots, gameName, appId }: DepotTreeProps) {
    const [allExpanded, setAllExpanded] = useState(false);

    const withManifest = depots.filter(d => d.manifestId);
    const shared = depots.filter(d => d.isShared && !d.manifestId);
    const missing = depots.filter(d => !d.manifestId && !d.isShared);

    return (
        <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-brand-400" />
                    Depot Tree
                    <span className="text-xs font-normal text-gray-500">({depots.length} depots)</span>
                </h3>
                <button
                    onClick={() => setAllExpanded(!allExpanded)}
                    className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                >
                    {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
            </div>

            {/* Summary bar */}
            <div className="flex gap-3 mb-4 text-xs">
                <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-3 h-3" /> {withManifest.length} with manifest
                </span>
                {shared.length > 0 && (
                    <span className="flex items-center gap-1 text-yellow-400">
                        <Globe className="w-3 h-3" /> {shared.length} shared
                    </span>
                )}
                {missing.length > 0 && (
                    <span className="flex items-center gap-1 text-red-400">
                        <AlertTriangle className="w-3 h-3" /> {missing.length} missing
                    </span>
                )}
            </div>

            {/* Tree */}
            <div className="space-y-0.5 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {depots.map((depot) => (
                    <DepotNode key={depot.depotId} depot={depot} />
                ))}
            </div>
        </div>
    );
}
