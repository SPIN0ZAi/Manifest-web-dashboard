'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, Search, Eye, Download, UserPlus, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityLog {
    _id: string;
    actionType: 'search' | 'view' | 'download_manifest' | 'request_access';
    appId?: string;
    gameName?: string;
    username?: string;
    discordId?: string;
    metadata?: { avatar?: string };
    createdAt: string;
}

export function ActivityFeed() {
    const [activities, setActivities] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const latestIdsRef = useRef<string>('');

    const fetchActivity = async () => {
        if (typeof document !== 'undefined' && document.hidden) return;

        try {
            const res = await fetch('/api/stats/activity');
            const data = await res.json();
            if (data.success) {
                const incoming = Array.isArray(data.data) ? data.data : [];
                const nextIds = incoming.map((item: ActivityLog) => item._id).join('|');

                // Skip state updates when payload is unchanged
                if (nextIds !== latestIdsRef.current) {
                    latestIdsRef.current = nextIds;
                    setActivities(incoming);
                }
            }
        } catch (e) {
            console.error('Failed to fetch activity', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchActivity();
        const interval = setInterval(fetchActivity, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'search': return <Search className="w-4 h-4 text-blue-400" />;
            case 'view': return <Eye className="w-4 h-4 text-purple-400" />;
            case 'download_manifest': return <Download className="w-4 h-4 text-green-400" />;
            case 'request_access': return <UserPlus className="w-4 h-4 text-yellow-400" />;
            default: return <Activity className="w-4 h-4 text-gray-400" />;
        }
    };

    const getMessage = (log: ActivityLog) => {
        // "Anonymous User just viewed Grand Theft Auto 5"
        const name = log.gameName || `App ${log.appId}` || 'a game';
        const user = log.username || 'A user';

        switch (log.actionType) {
            case 'search': return <span>searched for <strong>{name}</strong></span>;
            case 'view': return <span>is looking at <strong>{name}</strong></span>;
            case 'download_manifest': return <span>downloaded the manifest for <strong>{name}</strong></span>;
            case 'request_access': return <span>requested access to the admin dashboard</span>;
            default: return <span>interacted with the site</span>;
        }
    };

    if (loading && activities.length === 0) {
        return (
            <div className="glass-card p-6 flex items-center justify-center h-[420px]">
                <Sparkles className="w-6 h-6 text-brand-500 animate-pulse" />
            </div>
        );
    }

    if (activities.length === 0) {
        return null; // Don't show if empty
    }

    return (
        <div className="glass-card overflow-hidden flex flex-col border-brand-500/10 h-[420px]">
            <div className="p-5 border-b border-white/5 bg-surface-200/50 flex items-center gap-3">
                <div className="relative flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </div>
                <h3 className="text-sm font-semibold text-white tracking-wide uppercase">Live Community Feed</h3>
            </div>

            <div className="p-2 flex-1 overflow-hidden relative">
                {/* Fade masks */}
                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-surface/80 to-transparent z-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-surface/80 to-transparent z-10 pointer-events-none" />

                <div className="flex flex-col gap-1 p-2 max-h-[350px] overflow-y-auto no-scrollbar">
                    {activities.map((log) => (
                        <div key={log._id} className="group flex gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
                            <div className="mt-0.5 flex-shrink-0">
                                {log.metadata?.avatar ? (
                                    <img
                                        src={log.metadata.avatar}
                                        alt={log.username || 'User'}
                                        className="w-8 h-8 rounded-full border border-white/10 object-cover"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                ) : log.username ? (
                                    <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-xs font-bold text-brand-400">
                                        {log.username.charAt(0).toUpperCase()}
                                    </div>
                                ) : (
                                    <div className="p-2 rounded-lg bg-surface-300 border border-white/5 shadow-inner">
                                        {getIcon(log.actionType)}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-300 leading-snug truncate">
                                    <span className={log.username ? 'text-white font-medium' : 'text-gray-500'}>{log.username || 'Someone'}</span> {getMessage(log)}
                                </p>
                                <p className="text-xs text-brand-500/70 mt-1 font-mono">
                                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
