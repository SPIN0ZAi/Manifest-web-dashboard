'use client';

import { useSession, signIn } from 'next-auth/react';
import { Loader2, Lock, Clock, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

export function AccessGate({ children }: { children: React.ReactNode }) {
    const { data: session, status, update } = useSession();
    const [requesting, setRequesting] = useState(false);
    const [error, setError] = useState('');
    const [localStatus, setLocalStatus] = useState<string | null>(null);

    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface px-4">
                <div className="max-w-md w-full glass-card p-8 text-center animate-fade-in text-white">
                    <div className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-500/10">
                        <Lock className="w-8 h-8 text-brand-400" />
                    </div>
                    <h1 className="text-2xl font-bold mb-3">Authentication Required</h1>
                    <p className="text-gray-400 mb-8">
                        This website is restricted. You must log in with your Discord account and be approved by an administrator to gain access.
                    </p>
                    <button
                        onClick={() => signIn('discord')}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                    >
                        Login with Discord
                    </button>
                </div>
            </div>
        );
    }

    const accessStatus = localStatus || (session?.user as any)?.accessStatus || 'unrequested';

    if (accessStatus === 'approved') {
        return <>{children}</>;
    }

    const handleRequestAccess = async () => {
        setRequesting(true);
        setError('');
        try {
            const res = await fetch('/api/user/request-access', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setLocalStatus('pending');
                await update();
            } else {
                setError(data.error || 'Failed to request access.');
            }
        } catch (err) {
            setError('Network error occurred.');
        } finally {
            setRequesting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
            <div className="max-w-md w-full glass-card p-8 text-center animate-fade-in text-white shadow-2xl">
                {accessStatus === 'pending' ? (
                    <div className="animate-fade-in">
                        <div className="text-8xl my-6 animate-pulse select-none">🐼💤</div>
                        <h1 className="text-2xl font-bold mb-3">lazy admin will approve soon</h1>
                        <p className="text-gray-400">
                            Your access request is currently pending administrator approval. Please check back later.
                        </p>
                    </div>
                ) : accessStatus === 'rejected' ? (
                    <>
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/10">
                            <ShieldAlert className="w-8 h-8 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-bold mb-3">Access Denied</h1>
                        <p className="text-gray-400">
                            Your request to access this website has been rejected by the administrator.
                        </p>
                    </>
                ) : (
                    <>
                        {/* unrequested */}
                        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/10">
                            <Lock className="w-8 h-8 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold mb-3">Access Restricted</h1>
                        <p className="text-gray-400 mb-8">
                            You have successfully logged in, but you need administrator approval to view this website.
                        </p>
                        {error && <p className="text-red-400 mb-4 text-sm font-medium">{error}</p>}
                        <button
                            onClick={handleRequestAccess}
                            disabled={requesting}
                            className="w-full btn-primary flex items-center justify-center gap-2"
                        >
                            {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Request Access
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
