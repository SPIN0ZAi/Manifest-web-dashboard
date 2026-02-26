'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ArrowUp, ArrowDown, CornerDownLeft, X, Command } from 'lucide-react';

interface SearchResult {
    appId: number;
    name: string;
    headerImage: string;
    type: string;
}

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    // Global keyboard shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Auto-focus on open
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
        }
    }, [open]);

    // Debounced search
    const search = useCallback((q: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!q.trim()) { setResults([]); setLoading(false); return; }

        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                if (data.success) {
                    setResults(data.data.results.slice(0, 8));
                    setSelectedIndex(0);
                }
            } catch {
                // silent
            } finally {
                setLoading(false);
            }
        }, 300);
    }, []);

    const handleInputChange = (val: string) => {
        setQuery(val);
        search(val);
    };

    const navigate = (appId: number) => {
        setOpen(false);
        router.push(`/app/${appId}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            navigate(results[selectedIndex].appId);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                style={{ animation: 'fadeIn 0.15s ease-out' }}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-xl mx-4 bg-surface-100/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                style={{ animation: 'scaleIn 0.15s ease-out' }}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
                    <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
                        placeholder="Search games by name or AppID..."
                    />
                    {loading && <Loader2 className="w-4 h-4 text-brand-500 animate-spin flex-shrink-0" />}
                    <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Results */}
                {results.length > 0 && (
                    <div className="max-h-[400px] overflow-y-auto py-2">
                        {results.map((result, i) => (
                            <button
                                key={result.appId}
                                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-all ${i === selectedIndex ? 'bg-brand-500/10 text-white' : 'text-gray-300 hover:bg-white/5'
                                    }`}
                                onClick={() => navigate(result.appId)}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                <img
                                    src={result.headerImage}
                                    alt=""
                                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{result.name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{result.appId}</p>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded text-gray-500 uppercase flex-shrink-0">
                                    {result.type}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {query && !loading && results.length === 0 && (
                    <div className="py-12 text-center text-gray-500 text-sm">
                        No results found
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center gap-4 px-5 py-3 border-t border-white/5 text-[10px] text-gray-600">
                    <span className="flex items-center gap-1">
                        <ArrowUp className="w-3 h-3" /><ArrowDown className="w-3 h-3" /> Navigate
                    </span>
                    <span className="flex items-center gap-1">
                        <CornerDownLeft className="w-3 h-3" /> Open
                    </span>
                    <span className="flex items-center gap-1">
                        Esc Close
                    </span>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
