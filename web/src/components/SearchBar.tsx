'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
    compact?: boolean;
    autoFocus?: boolean;
    placeholder?: string;
    className?: string;
}

export function SearchBar({ compact = false, autoFocus = false, placeholder, className = '' }: SearchBarProps) {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            const trimmed = query.trim();
            if (!trimmed) return;

            setLoading(true);

            // If numeric, go directly to app detail page
            if (/^\d+$/.test(trimmed)) {
                router.push(`/app/${trimmed}`);
            } else {
                router.push(`/search?q=${encodeURIComponent(trimmed)}`);
            }

            // Loading state resets on page navigation
            setTimeout(() => setLoading(false), 2000);
        },
        [query, router]
    );

    return (
        <form onSubmit={handleSubmit} className={`relative ${className}`}>
            <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder || (compact ? 'Search games...' : 'Enter AppID (e.g., 730) or game name...')}
                    autoFocus={autoFocus}
                    className={`w-full bg-surface-200 border border-white/5 text-gray-100 placeholder:text-gray-500
                     focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20
                     transition-all duration-200 ${compact
                            ? 'pl-9 pr-3 py-2 text-sm rounded-lg'
                            : 'pl-12 pr-14 py-4 text-base rounded-2xl'
                        }`}
                />
                {!compact && (
                    <button
                        type="submit"
                        disabled={loading || !query.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-brand-600 text-white text-sm font-medium
                       rounded-xl transition-all hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
                    </button>
                )}
            </div>
        </form>
    );
}
