'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Search, BarChart3, Home, Menu, X, Gamepad2, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';

const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/stats', label: 'Statistics', icon: BarChart3 },
];

export function Navbar() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session, status } = useSession();
    const isAdmin = (session?.user as any)?.id === '302125862340526120';
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Gamepad2 className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-lg font-bold text-white hidden sm:block">
                            Project <span className="gradient-text">Cairo</span>
                        </span>
                    </Link>

                    {/* Desktop nav links */}
                    <div className="hidden md:flex items-center gap-1">
                        {navLinks.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                        ? 'bg-brand-600/20 text-brand-400'
                                        : 'text-gray-400 hover:text-white hover:bg-surface-200'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>

                </div>

                {/* Desktop Right Side: Auth */}
                <div className="hidden md:flex items-center gap-4">

                    {/* Auth */}
                    {mounted && status === 'loading' ? (
                        <div className="w-8 h-8 rounded-full bg-surface-200 animate-pulse" />
                    ) : mounted && session?.user ? (
                        <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                            {isAdmin && (
                                <Link
                                    href="/admin"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors border border-red-500/20"
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Admin
                                </Link>
                            )}
                            <div className="flex items-center gap-2">
                                <Link href="/profile" className="hover:opacity-80 transition-opacity" title="View Profile">
                                    {session.user.image ? (
                                        <img src={session.user.image} alt="Avatar" className="w-8 h-8 rounded-full border border-white/10" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
                                            <span className="text-xs text-brand-400 font-bold">{session.user.name?.[0] || '?'}</span>
                                        </div>
                                    )}
                                </Link>
                                <button
                                    onClick={() => signOut()}
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-surface-200 rounded-lg transition-colors"
                                    title="Sign out"
                                >
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : mounted ? (
                        <button
                            onClick={() => signIn('discord')}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium transition-colors shadow-lg shadow-[#5865F2]/20"
                        >
                            <LogIn className="w-4 h-4" />
                            Login
                        </button>
                    ) : null}
                </div>

                {/* Mobile menu toggle */}
                <button
                    className="md:hidden p-2 text-gray-400 hover:text-white"
                    onClick={() => setMobileOpen(!mobileOpen)}
                >
                    {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="md:hidden bg-surface-50 border-t border-white/5 px-4 py-4 animate-slide-up">
                    <div className="flex flex-col gap-1 mb-4">
                        {navLinks.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    onClick={() => setMobileOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive
                                        ? 'bg-brand-600/20 text-brand-400'
                                        : 'text-gray-400 hover:text-white hover:bg-surface-200'
                                        }`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Mobile Auth */}
                    {mounted && session?.user ? (
                        <div className="flex items-center justify-between pt-4 border-t border-white/10">
                            <Link href="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" title="View Profile">
                                {session.user.image && (
                                    <img src={session.user.image} alt="Avatar" className="w-8 h-8 rounded-full" />
                                )}
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-white">{session.user.name}</span>
                                    {isAdmin && <span className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Admin</span>}
                                </div>
                            </Link>
                            <div className="flex items-center gap-2">
                                {isAdmin && (
                                    <Link
                                        href="/admin"
                                        onClick={() => setMobileOpen(false)}
                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <ShieldCheck className="w-5 h-5" />
                                    </Link>
                                )}
                                <button
                                    onClick={() => signOut()}
                                    className="p-2 text-gray-400 hover:text-white hover:bg-surface-200 rounded-lg transition-colors"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ) : mounted ? (
                        <div className="pt-4 border-t border-white/10">
                            <button
                                onClick={() => signIn('discord')}
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium transition-colors"
                            >
                                <LogIn className="w-4 h-4" />
                                Login with Discord
                            </button>
                        </div>
                    ) : null}
                </div>
            )}
        </nav>
    );
}
