'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Upload, X, ShieldAlert, FileArchive, CheckCircle2, AlertCircle, Loader2, Users, HardDriveUpload, Check, XCircle, Clock } from 'lucide-react';

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';

interface UploadItem {
    id: string;
    file: File;
    status: UploadStatus;
    progress: number;
    message?: string;
    stats?: {
        appId: string;
        gameName: string;
        manifestsCount: number;
        hasTokens: boolean;
        hasKeys: boolean;
    };
}

interface UserItem {
    discordId: string;
    username: string;
    avatar?: string;
    accessStatus: 'unrequested' | 'pending' | 'approved' | 'rejected';
    role: string;
    createdAt: string;
}

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // User Management State
    const [activeTab, setActiveTab] = useState<'uploads' | 'users'>('uploads');
    const [users, setUsers] = useState<UserItem[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
    }, [activeTab]);

    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const res = await fetch('/api/admin/users', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setUsers(data.users);
        } catch (err) {
            console.error(err);
        } finally {
            setUsersLoading(false);
        }
    };

    const handleUserStatusChange = async (discordId: string, newStatus: string) => {
        try {
            const res = await fetch('/api/admin/users/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discordId, status: newStatus })
            });
            const data = await res.json();
            if (data.success) {
                setUsers(prev => prev.map(u => u.discordId === discordId ? { ...u, accessStatus: newStatus as any } : u));
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Redirect if not admin
    if (status === 'loading') {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    if (!session || (session.user as any)?.id !== '302125862340526120') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4">
                <ShieldAlert className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-gray-400">You do not have permission to view this page.</p>
                <button
                    onClick={() => router.push('/')}
                    className="mt-6 px-4 py-2 bg-surface-200 hover:bg-surface-300 text-white rounded-xl transition-colors"
                >
                    Return Home
                </button>
            </div>
        );
    }

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
        else if (e.type === 'dragleave') setIsDragging(false);
    }, []);

    const processFiles = (files: FileList | File[]) => {
        const zipFiles = Array.from(files).filter(f => f.name.endsWith('.zip'));
        if (zipFiles.length === 0) return;

        const newUploads = zipFiles.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            status: 'pending' as UploadStatus,
            progress: 0
        }));

        setUploads(prev => [...prev, ...newUploads]);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    };

    const removeFile = (id: string) => {
        setUploads(prev => prev.filter(u => u.id !== id));
    };

    const uploadFiles = async () => {
        const pendingUploads = uploads.filter(u => u.status === 'pending' || u.status === 'error');
        if (pendingUploads.length === 0) return;

        for (const upload of pendingUploads) {
            setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading', progress: 10 } : u));

            const formData = new FormData();
            formData.append('file', upload.file);

            try {
                const response = await fetch('/api/admin/upload', {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();

                if (response.ok) {
                    setUploads(prev => prev.map(u => u.id === upload.id ? {
                        ...u,
                        status: 'success',
                        progress: 100,
                        message: result.message,
                        stats: result.stats
                    } : u));
                } else {
                    setUploads(prev => prev.map(u => u.id === upload.id ? {
                        ...u,
                        status: 'error',
                        progress: 0,
                        message: result.error || 'Upload failed'
                    } : u));
                }
            } catch (err) {
                setUploads(prev => prev.map(u => u.id === upload.id ? {
                    ...u,
                    status: 'error',
                    progress: 0,
                    message: 'Network error occurred'
                } : u));
            }
        }
    };
    return (
        <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
                <p className="text-gray-400">Manage repository uploads and user access requests.</p>

                <div className="flex gap-4 mt-6">
                    <button
                        onClick={() => setActiveTab('uploads')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'uploads' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-200'}`}
                    >
                        <HardDriveUpload className="w-4 h-4" />
                        File Uploads
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-200'}`}
                    >
                        <Users className="w-4 h-4" />
                        User Access Requests
                    </button>
                </div>
            </div>

            {activeTab === 'uploads' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Upload Zone */}
                    <div className="lg:col-span-2 space-y-6">
                        <div
                            className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all ${isDragging
                                ? 'border-brand-500 bg-brand-500/10'
                                : 'border-white/10 hover:border-white/20 hover:bg-surface-50'
                                }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <input
                                type="file"
                                multiple
                                accept=".zip"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={handleFileSelect}
                            />
                            <div className="flex flex-col items-center justify-center gap-4 pointer-events-none">
                                <div className={`p-4 rounded-2xl ${isDragging ? 'bg-brand-500/20' : 'bg-surface-200'}`}>
                                    <Upload className={`w-8 h-8 ${isDragging ? 'text-brand-400' : 'text-gray-400'}`} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-white">Drag & drop ZIP files</h3>
                                    <p className="text-sm text-gray-400 mt-1">or click to browse from your computer</p>
                                </div>
                            </div>
                        </div>

                        {/* Upload List */}
                        {uploads.length > 0 && (
                            <div className="bg-surface/50 rounded-3xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="font-medium text-white">Upload Queue ({uploads.length})</h3>
                                    <button
                                        onClick={uploadFiles}
                                        disabled={!uploads.some(u => u.status === 'pending' || u.status === 'error')}
                                        className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                                    >
                                        Start Uploading
                                    </button>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {uploads.map((upload) => (
                                        <div key={upload.id} className="p-4 flex items-center gap-4">
                                            <div className="p-2 rounded-xl bg-surface-200">
                                                <FileArchive className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-sm font-medium text-white truncate">{upload.file.name}</p>
                                                    {upload.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                                    {upload.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                                    {upload.status === 'uploading' && <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />}
                                                </div>
                                                {upload.status === 'uploading' ? (
                                                    <div className="h-1.5 w-full bg-surface-200 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-brand-500 transition-all duration-500"
                                                            style={{ width: `${upload.progress}%` }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <p className={`text-xs ${upload.status === 'error' ? 'text-red-400' :
                                                        upload.status === 'success' ? 'text-emerald-400' :
                                                            'text-gray-500'
                                                        }`}>
                                                        {upload.message || `${(upload.file.size / (1024 * 1024)).toFixed(2)} MB`}
                                                    </p>
                                                )}
                                            </div>
                                            {upload.status !== 'uploading' && (
                                                <button
                                                    onClick={() => removeFile(upload.id)}
                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-surface-200 rounded-lg transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar Info */}
                    <div className="space-y-6">
                        <div className="bg-surface/50 rounded-3xl p-6 border border-white/5">
                            <h3 className="text-lg font-medium text-white mb-4">How it works</h3>
                            <ul className="space-y-4 text-sm text-gray-400">
                                <li className="flex items-start gap-3">
                                    <div className="p-1 rounded-full bg-brand-500/20 text-brand-400 mt-0.5">1</div>
                                    <p>Upload ZIP files containing Lua manifests and Depot manifests.</p>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-1 rounded-full bg-brand-500/20 text-brand-400 mt-0.5">2</div>
                                    <p>The system automatically cleans Lua headers, preserving important comments.</p>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-1 rounded-full bg-brand-500/20 text-brand-400 mt-0.5">3</div>
                                    <p>Manifests are matched to their proper AppID using Lua depot parsing.</p>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="p-1 rounded-full bg-brand-500/20 text-brand-400 mt-0.5">4</div>
                                    <p>Files are pushed directly to the GitHub repository.</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-surface/50 rounded-3xl border border-white/5 overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <h2 className="text-lg font-medium text-white">User Access Management</h2>
                        <p className="text-sm text-gray-400 mt-1">Approve or reject users who have requested access to the platform.</p>
                    </div>

                    {usersLoading ? (
                        <div className="p-12 flex justify-center">
                            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-12 text-center text-gray-400">
                            No users found in the database.
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {users.map(user => (
                                <div key={user.discordId} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        {user.avatar ? (
                                            <img src={user.avatar} alt="Avatar" className="w-12 h-12 rounded-full border border-white/10" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-surface-200 flex items-center justify-center">
                                                <Users className="w-6 h-6 text-gray-400" />
                                            </div>
                                        )}
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-medium text-white">{user.username}</h3>
                                                {user.role === 'admin' && (
                                                    <span className="text-[10px] uppercase font-bold text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Admin</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-gray-500">ID: {user.discordId}</span>
                                                <span className="text-gray-600">•</span>
                                                {user.accessStatus === 'pending' && <span className="text-yellow-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>}
                                                {user.accessStatus === 'approved' && <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3" /> Approved</span>}
                                                {user.accessStatus === 'rejected' && <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> Rejected</span>}
                                                {user.accessStatus === 'unrequested' && <span className="text-gray-500">Unrequested</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        {user.role !== 'admin' && (
                                            <>
                                                {user.accessStatus !== 'approved' && (
                                                    <button
                                                        onClick={() => handleUserStatusChange(user.discordId, 'approved')}
                                                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium border border-emerald-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Approve
                                                    </button>
                                                )}
                                                {user.accessStatus !== 'rejected' && (
                                                    <button
                                                        onClick={() => handleUserStatusChange(user.discordId, 'rejected')}
                                                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/20 rounded-lg transition-colors flex items-center gap-1.5"
                                                    >
                                                        <X className="w-4 h-4" />
                                                        Reject
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
