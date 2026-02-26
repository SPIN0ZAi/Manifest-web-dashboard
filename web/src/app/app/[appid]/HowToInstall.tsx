'use client';

import { useState } from 'react';
import { ChevronDown, BookOpen, Wrench, Download } from 'lucide-react';

interface HowToInstallProps {
    gameName: string;
    appId: number;
}

export function HowToInstall({ gameName, appId }: HowToInstallProps) {
    const [open, setOpen] = useState(false);
    const [method, setMethod] = useState<'steamtools' | 'millennium'>('steamtools');

    return (
        <div className="glass-card overflow-hidden mb-6">
            <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-all"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <BookOpen className="w-4 h-4 text-brand-400" />
                    How to Install Manifests
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            <div
                className="overflow-hidden transition-all duration-300"
                style={{ maxHeight: open ? '800px' : '0px', opacity: open ? 1 : 0 }}
            >
                <div className="px-5 pb-5 border-t border-white/5">
                    {/* Method toggle */}
                    <div className="flex bg-surface-200 p-1 rounded-xl mt-4 mb-5 w-fit">
                        {(['steamtools', 'millennium'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMethod(m)}
                                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg capitalize transition-all ${method === m ? 'bg-brand-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                <Wrench className="w-3 h-3" />
                                {m === 'steamtools' ? 'SteamTools' : 'Millennium'}
                            </button>
                        ))}
                    </div>

                    {method === 'steamtools' ? (
                        <div className="space-y-4 text-sm text-gray-300">
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center">1</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Download SteamTools</p>
                                    <p className="text-gray-400">Get the latest version from the official source and extract it.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center">2</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Download the Lua manifest</p>
                                    <p className="text-gray-400">Download the <code className="px-1.5 py-0.5 bg-surface-300 rounded text-xs font-mono text-brand-400">{appId}.lua</code> file from this page or use the "Download ZIP" button.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center">3</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Place the file</p>
                                    <p className="text-gray-400">Copy the Lua file to the SteamTools config directory:</p>
                                    <code className="block mt-1 px-3 py-2 bg-surface-300 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto">
                                        SteamTools/config/manifests/{appId}.lua
                                    </code>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 text-xs font-bold flex items-center justify-center">4</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Launch & Unlock</p>
                                    <p className="text-gray-400">Run SteamTools, select <strong className="text-white">{gameName}</strong>, and apply the manifest. Then launch the game through Steam.</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 text-sm text-gray-300">
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">1</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Install Millennium</p>
                                    <p className="text-gray-400">Download and install Millennium from the official GitHub release page.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">2</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Download the manifest files</p>
                                    <p className="text-gray-400">Download the Lua and JSON files for <strong className="text-white">{gameName}</strong> from this page.</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">3</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Place the files</p>
                                    <p className="text-gray-400">Copy all manifest files into the Millennium plugins directory:</p>
                                    <code className="block mt-1 px-3 py-2 bg-surface-300 rounded-lg text-xs font-mono text-gray-300 overflow-x-auto">
                                        Steam/plugins/millennium/manifests/{appId}/
                                    </code>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center">4</span>
                                <div>
                                    <p className="text-white font-medium mb-1">Restart Steam</p>
                                    <p className="text-gray-400">Restart Steam completely. Millennium will apply the manifests automatically when the game is launched.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
