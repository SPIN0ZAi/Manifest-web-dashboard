'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { HardDrive, Package, FileCode, Key } from 'lucide-react';

interface Tab {
    id: string;
    label: string;
    icon: ReactNode;
    count?: number;
}

interface GameTabsProps {
    depotsTab: ReactNode;
    dlcTab: ReactNode;
    luaTab: ReactNode;
    branchTab: ReactNode;
    depotCount: number;
    dlcCount: number;
    fileCount: number;
    hasLua: boolean;
}

export function GameTabs({
    depotsTab, dlcTab, luaTab, branchTab,
    depotCount, dlcCount, fileCount, hasLua
}: GameTabsProps) {
    const tabs: Tab[] = [
        { id: 'depots', label: 'Depots', icon: <HardDrive className="w-4 h-4" />, count: depotCount },
        { id: 'dlc', label: 'DLC', icon: <Package className="w-4 h-4" />, count: dlcCount },
        { id: 'lua', label: 'Lua Files', icon: <FileCode className="w-4 h-4" /> },
        { id: 'branches', label: 'Branch Info', icon: <Key className="w-4 h-4" />, count: fileCount },
    ];

    const [activeTab, setActiveTab] = useState('depots');
    const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['depots']));

    const handleTabClick = useCallback((tabId: string) => {
        setActiveTab(tabId);
        setMountedTabs(prev => {
            const next = new Set(prev);
            next.add(tabId);
            return next;
        });
    }, []);

    const content: Record<string, ReactNode> = {
        depots: depotsTab,
        dlc: dlcTab,
        lua: luaTab,
        branches: branchTab,
    };

    return (
        <div className="mt-8">
            {/* Tab Bar */}
            <div className="relative flex border-b border-white/10 mb-6 overflow-x-auto">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all duration-200 ${isActive
                                    ? 'text-brand-400'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${isActive ? 'bg-brand-500/20 text-brand-400' : 'bg-white/5 text-gray-500'
                                    }`}>
                                    {tab.count}
                                </span>
                            )}
                            {!hasLua && tab.id === 'lua' && (
                                <span className="ml-1 w-2 h-2 rounded-full bg-gray-600" />
                            )}

                            {/* Active indicator */}
                            {isActive && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" style={{
                                    animation: 'tabSlideIn 0.2s ease-out'
                                }} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div>
                {tabs.map((tab) => {
                    if (!mountedTabs.has(tab.id)) return null;
                    return (
                        <div
                            key={tab.id}
                            className={activeTab === tab.id ? 'animate-fade-in' : 'hidden'}
                        >
                            {content[tab.id]}
                        </div>
                    );
                })}
            </div>

            <style jsx>{`
                @keyframes tabSlideIn {
                    from { transform: scaleX(0); }
                    to { transform: scaleX(1); }
                }
            `}</style>
        </div>
    );
}
