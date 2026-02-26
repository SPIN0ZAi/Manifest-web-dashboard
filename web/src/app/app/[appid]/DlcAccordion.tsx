'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ChevronRight, CheckCircle, XCircle, Package, Sparkles, Music
} from 'lucide-react';
import type { DlcInfo } from '@/lib/types';

interface DlcAccordionProps {
    dlcList: DlcInfo[];
    contentDlcCount: number;
    trackedContentDlc: number;
    dlcCompletionPercent: number;
}

function DlcRow({ dlc }: { dlc: DlcInfo }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-white/5 rounded-xl overflow-hidden transition-all">
            <button
                className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-all"
                onClick={() => setExpanded(!expanded)}
            >
                <ChevronRight className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />

                {/* Tracked indicator */}
                {dlc.isTracked ? (
                    <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                ) : (
                    <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                )}

                {/* Name */}
                <span className="text-gray-300 text-xs truncate flex-1 text-left">{dlc.name}</span>

                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {dlc.dlcType === 'extra' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 font-medium flex items-center gap-0.5">
                            <Music className="w-2.5 h-2.5" /> extra
                        </span>
                    ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">
                            content
                        </span>
                    )}
                    {dlc.hasOwnDepot && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
                            depot
                        </span>
                    )}
                    <span className="font-mono text-[10px] text-gray-600">{dlc.appId}</span>
                </div>
            </button>

            {/* Expanded Details */}
            <div
                className="overflow-hidden transition-all duration-300"
                style={{
                    maxHeight: expanded ? '200px' : '0px',
                    opacity: expanded ? 1 : 0,
                }}
            >
                <div className="px-4 pb-3 pt-1 ml-5 border-t border-white/5">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>AppID: <span className="font-mono text-gray-300">{dlc.appId}</span></span>
                        <span className="text-gray-600">•</span>
                        <span>
                            Status: {dlc.isTracked ? (
                                <span className="text-green-400 font-medium">Tracked ✓</span>
                            ) : (
                                <span className="text-red-400 font-medium">Not tracked</span>
                            )}
                        </span>
                        {dlc.hasOwnDepot && (
                            <>
                                <span className="text-gray-600">•</span>
                                <span className="text-blue-400">Has own depot</span>
                            </>
                        )}
                    </div>
                    <Link
                        href={`/app/${dlc.appId}`}
                        className="inline-flex items-center gap-1 mt-2 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                    >
                        View details →
                    </Link>
                </div>
            </div>
        </div>
    );
}

export function DlcAccordion({ dlcList, contentDlcCount, trackedContentDlc, dlcCompletionPercent }: DlcAccordionProps) {
    const [showAll, setShowAll] = useState(false);
    const contentDlcs = dlcList.filter(d => d.dlcType === 'content');
    const extraDlcs = dlcList.filter(d => d.dlcType === 'extra');
    const visible = showAll ? dlcList : dlcList.slice(0, 30);

    return (
        <div className="glass-card p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-400" />
                    DLC List
                    <span className="text-xs font-normal text-gray-500">({dlcList.length} total)</span>
                </h3>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-green-400">{trackedContentDlc} tracked</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-purple-400">{contentDlcs.length} content</span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> {extraDlcs.length} extras</span>
                </div>
            </div>

            {/* Completion bar */}
            {contentDlcCount > 0 && (
                <div className="mb-4">
                    <div className="w-full h-2 bg-surface-300 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${dlcCompletionPercent >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                                    dlcCompletionPercent >= 40 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                                        'bg-gradient-to-r from-red-500 to-rose-400'
                                }`}
                            style={{ width: `${Math.min(dlcCompletionPercent, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                        <span>{trackedContentDlc}/{contentDlcCount} content DLCs tracked</span>
                        <span>{dlcCompletionPercent}%</span>
                    </div>
                </div>
            )}

            {/* Accordion list */}
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                {visible.map((dlc) => (
                    <DlcRow key={dlc.appId} dlc={dlc} />
                ))}
            </div>

            {dlcList.length > 30 && !showAll && (
                <button
                    onClick={() => setShowAll(true)}
                    className="mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors"
                >
                    Show all {dlcList.length} DLCs →
                </button>
            )}

            {dlcList.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">No DLC found for this game.</p>
            )}
        </div>
    );
}
