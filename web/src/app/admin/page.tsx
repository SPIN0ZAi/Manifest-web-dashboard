'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Upload, X, ShieldAlert, FileArchive, CheckCircle2, AlertCircle, Loader2, Users, HardDriveUpload, Check, XCircle, Clock, Gamepad2, Search, Pencil, Trash2, Save } from 'lucide-react';

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

interface GameItem {
    _id: string;
    id: string;
    steamAppId?: string;
    title: string;
    status: 'cracked' | 'uncracked';
    releaseDate?: string;
    drm: string;
    image?: string;
    cracker?: string;
    crackDate?: string;
    notes?: string;
}

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // User Management State
    const [activeTab, setActiveTab] = useState<'uploads' | 'users' | 'games'>('uploads');
    const [users, setUsers] = useState<UserItem[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);

    // Game Management State
    const [games, setGames] = useState<GameItem[]>([]);
    const [gamesLoading, setGamesLoading] = useState(false);
    const [gameSearch, setGameSearch] = useState('');
    const [gameFilter, setGameFilter] = useState<'all' | 'cracked' | 'uncracked'>('all');
    const [editingGame, setEditingGame] = useState<GameItem | null>(null);
    const [editForm, setEditForm] = useState({
        title: '',
        status: 'uncracked',
        drm: '',
        cracker: '',
        crackDate: '',
        releaseDate: '',
        image: '',
        notes: ''
    });
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [editSaveStatus, setEditSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Game Import State
    const [gameForm, setGameForm] = useState({
        steamAppId: '',
        title: '',
        status: 'uncracked',
        drm: 'Denuvo',
        cracker: '',
        crackDate: '',
        releaseDate: '',
        notes: ''
    });
    const [gameSubmitStatus, setGameSubmitStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [isSubmittingGame, setIsSubmittingGame] = useState(false);

    const handleGameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingGame(true);
        setGameSubmitStatus(null);
        try {
            const res = await fetch('/api/admin/games/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gameForm)
            });
            const data = await res.json();
            if (data.success) {
                setGameSubmitStatus({ type: 'success', message: 'Game successfully added/updated!' });
                setGameForm(prev => ({ ...prev, steamAppId: '', title: '' }));
                fetchGames(); // Refresh the list
            } else {
                setGameSubmitStatus({ type: 'error', message: data.error || 'Failed to add game' });
            }
        } catch (err) {
            setGameSubmitStatus({ type: 'error', message: 'Network error occurred' });
        } finally {
            setIsSubmittingGame(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'games') fetchGames();
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

    const fetchGames = async () => {
        setGamesLoading(true);
        try {
            const res = await fetch('/api/admin/games', { cache: 'no-store' });
            const data = await res.json();
            if (data.success) setGames(data.games);
        } catch (err) {
            console.error(err);
        } finally {
            setGamesLoading(false);
        }
    };

    const openEditModal = (game: GameItem) => {
        setEditingGame(game);
        setEditForm({
            title: game.title || '',
            status: game.status || 'uncracked',
            drm: game.drm || '',
            cracker: game.cracker || '',
            crackDate: game.crackDate || '',
            releaseDate: game.releaseDate?.toString() || '',
            image: game.image || '',
            notes: game.notes || ''
        });
        setEditSaveStatus(null);
    };

    const handleEditSave = async () => {
        if (!editingGame) return;
        setIsSavingEdit(true);
        setEditSaveStatus(null);
        try {
            const res = await fetch('/api/admin/games', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: editingGame._id, ...editForm })
            });
            const data = await res.json();
            if (data.success) {
                setEditSaveStatus({ type: 'success', message: 'Game updated successfully!' });
                setGames(prev => prev.map(g => g._id === editingGame._id ? { ...g, ...editForm } as GameItem : g));
                setTimeout(() => setEditingGame(null), 800);
            } else {
                setEditSaveStatus({ type: 'error', message: data.error || 'Failed to update game' });
            }
        } catch (err) {
            setEditSaveStatus({ type: 'error', message: 'Network error occurred' });
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleDeleteGame = async (gameId: string) => {
        setDeletingId(gameId);
        try {
            const res = await fetch(`/api/admin/games?id=${gameId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setGames(prev => prev.filter(g => g._id !== gameId));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleQuickStatusToggle = async (game: GameItem) => {
        const newStatus = game.status === 'cracked' ? 'uncracked' : 'cracked';
        try {
            const res = await fetch('/api/admin/games', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: game._id, status: newStatus })
            });
            const data = await res.json();
            if (data.success) {
                setGames(prev => prev.map(g => g._id === game._id ? { ...g, status: newStatus } : g));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const filteredGames = games.filter(game => {
        const matchesSearch = game.title.toLowerCase().includes(gameSearch.toLowerCase()) ||
            (game.drm && game.drm.toLowerCase().includes(gameSearch.toLowerCase())) ||
            (game.cracker && game.cracker.toLowerCase().includes(gameSearch.toLowerCase()));
        const matchesFilter = gameFilter === 'all' || game.status === gameFilter;
        return matchesSearch && matchesFilter;
    });

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
                    <button
                        onClick={() => setActiveTab('games')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'games' ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-white hover:bg-surface-200'}`}
                    >
                        <Gamepad2 className="w-4 h-4" />
                        Game Management
                    </button>
                </div>
            </div>

            {activeTab === 'uploads' && (
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
            )}

            {activeTab === 'users' && (
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

            {activeTab === 'games' && (
                <div className="space-y-6">
                    {/* Edit Modal */}
                    {editingGame && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEditingGame(null)}>
                            <div className="bg-surface-100 rounded-3xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Edit Game</h2>
                                        <p className="text-sm text-gray-400 mt-0.5">{editingGame.title}</p>
                                    </div>
                                    <button onClick={() => setEditingGame(null)} className="p-2 text-gray-400 hover:text-white hover:bg-surface-200 rounded-xl transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6 space-y-5">
                                    {editSaveStatus && (
                                        <div className={`p-3 rounded-xl flex items-center gap-3 text-sm font-medium ${editSaveStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                            {editSaveStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                                            {editSaveStatus.message}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Title</label>
                                            <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                                                className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
                                            <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                                className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500">
                                                <option value="uncracked">Uncracked</option>
                                                <option value="cracked">Cracked</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1.5">DRM Protection</label>
                                            <input type="text" value={editForm.drm} onChange={e => setEditForm({ ...editForm, drm: e.target.value })}
                                                className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" placeholder="Denuvo, VMProtect..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-400 mb-1.5">Release Date</label>
                                            <input type="text" value={editForm.releaseDate} onChange={e => setEditForm({ ...editForm, releaseDate: e.target.value })}
                                                className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" placeholder="e.g. 2024-08-30" />
                                        </div>
                                    </div>

                                    {editForm.status === 'cracked' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Cracker</label>
                                                <input type="text" value={editForm.cracker} onChange={e => setEditForm({ ...editForm, cracker: e.target.value })}
                                                    className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" placeholder="e.g. EMPRESS, RUNE" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-400 mb-1.5">Crack Date</label>
                                                <input type="text" value={editForm.crackDate} onChange={e => setEditForm({ ...editForm, crackDate: e.target.value })}
                                                    className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" placeholder="e.g. 2024-05 or Day 1" />
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Image URL</label>
                                        <input type="text" value={editForm.image} onChange={e => setEditForm({ ...editForm, image: e.target.value })}
                                            className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500" placeholder="https://..." />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label>
                                        <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2}
                                            className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 resize-none" placeholder="Optional notes..." />
                                    </div>

                                    <div className="pt-4 border-t border-white/5 flex items-center justify-end gap-3">
                                        <button onClick={() => setEditingGame(null)} className="px-4 py-2 text-gray-400 hover:text-white hover:bg-surface-200 rounded-xl transition-colors text-sm font-medium">
                                            Cancel
                                        </button>
                                        <button onClick={handleEditSave} disabled={isSavingEdit}
                                            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center gap-2 text-sm">
                                            {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Games List */}
                    <div className="bg-surface/50 rounded-3xl border border-white/5 overflow-hidden">
                        <div className="p-6 border-b border-white/5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                <div>
                                    <h2 className="text-lg font-medium text-white">All Games ({games.length})</h2>
                                    <p className="text-sm text-gray-400 mt-0.5">Click a game to edit its status and info.</p>
                                </div>
                                <button
                                    onClick={fetchGames}
                                    disabled={gamesLoading}
                                    className="px-4 py-2 bg-surface-200 hover:bg-surface-300 text-white text-sm font-medium rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
                                >
                                    {gamesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    Refresh
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input type="text" value={gameSearch} onChange={e => setGameSearch(e.target.value)}
                                        className="block w-full pl-10 pr-4 py-2.5 bg-surface-200 border border-white/10 rounded-xl text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                                        placeholder="Search by title, DRM, or cracker..." />
                                </div>
                                <div className="flex bg-surface-200 p-1 rounded-xl border border-white/5 whitespace-nowrap">
                                    {(['all', 'cracked', 'uncracked'] as const).map(f => (
                                        <button key={f} onClick={() => setGameFilter(f)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-all ${gameFilter === f ? 'bg-brand-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {gamesLoading ? (
                            <div className="p-12 flex justify-center">
                                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                            </div>
                        ) : filteredGames.length === 0 ? (
                            <div className="p-12 text-center text-gray-400">
                                {games.length === 0 ? 'No games in the database. Add or migrate games below.' : 'No games match your search.'}
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                                {filteredGames.map(game => (
                                    <div key={game._id} className="p-4 flex items-center gap-4 hover:bg-surface-100/50 transition-colors group">
                                        {/* Thumbnail */}
                                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-surface-200 shrink-0">
                                            {game.image ? (
                                                <img src={game.image} alt={game.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <Gamepad2 className="w-4 h-4 text-gray-500" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-white truncate">{game.title}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs text-gray-500 truncate">{game.drm || 'Unknown DRM'}</span>
                                                {game.cracker && (
                                                    <>
                                                        <span className="text-gray-600">•</span>
                                                        <span className="text-xs text-gray-500">{game.cracker}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status Badge (clickable) */}
                                        <button
                                            onClick={() => handleQuickStatusToggle(game)}
                                            title="Click to toggle status"
                                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border transition-all hover:scale-105 cursor-pointer shrink-0 ${game.status === 'cracked'
                                                    ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                                                    : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                                                }`}
                                        >
                                            {game.status}
                                        </button>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEditModal(game)} title="Edit game"
                                                className="p-2 text-gray-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => { if (confirm(`Delete "${game.title}"? This cannot be undone.`)) handleDeleteGame(game._id); }}
                                                disabled={deletingId === game._id}
                                                title="Delete game"
                                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {deletingId === game._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Add New Game Form */}
                    <div className="bg-surface/50 rounded-3xl border border-white/5 overflow-hidden">
                        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-medium text-white">Import / Add Game</h2>
                                <p className="text-sm text-gray-400 mt-1">Add a new protected game to the tracker list.</p>
                            </div>
                            <button
                                onClick={async () => {
                                    if (!confirm("Are you sure you want to run the migration? This will import all games from denuvo.json into MongoDB.")) return;
                                    const res = await fetch('/api/admin/games/migrate', { method: 'POST' });
                                    const data = await res.json();
                                    alert(data.message || data.error);
                                    fetchGames();
                                }}
                                className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-sm font-medium border border-purple-500/20 rounded-lg transition-colors whitespace-nowrap"
                            >
                                Run JSON Migration
                            </button>
                        </div>

                        <form onSubmit={handleGameSubmit} className="p-6 space-y-6 max-w-2xl">
                            {gameSubmitStatus && (
                                <div className={`p-4 rounded-xl flex items-center gap-3 ${gameSubmitStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {gameSubmitStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                                    <p className="text-sm font-medium">{gameSubmitStatus.message}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Steam App ID (Optional)</label>
                                    <input
                                        type="text"
                                        value={gameForm.steamAppId}
                                        onChange={(e) => setGameForm({ ...gameForm, steamAppId: e.target.value })}
                                        className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                        placeholder="e.g. 2358720"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Fetches title and image automatically.</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Title</label>
                                    <input
                                        type="text"
                                        value={gameForm.title}
                                        onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })}
                                        className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                        placeholder="Required if no Steam ID"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Crack Status</label>
                                    <select
                                        value={gameForm.status}
                                        onChange={(e) => setGameForm({ ...gameForm, status: e.target.value })}
                                        className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                    >
                                        <option value="uncracked">Uncracked</option>
                                        <option value="cracked">Cracked</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">DRM Protection</label>
                                    <input
                                        type="text"
                                        value={gameForm.drm}
                                        onChange={(e) => setGameForm({ ...gameForm, drm: e.target.value })}
                                        className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                        placeholder="Denuvo, VMProtect..."
                                    />
                                </div>
                            </div>

                            {gameForm.status === 'cracked' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Cracker (Scene Group)</label>
                                        <input
                                            type="text"
                                            value={gameForm.cracker}
                                            onChange={(e) => setGameForm({ ...gameForm, cracker: e.target.value })}
                                            className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                            placeholder="e.g. EMPRESS, RUNE"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-2">Crack Date</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={gameForm.crackDate}
                                                onChange={(e) => setGameForm({ ...gameForm, crackDate: e.target.value })}
                                                className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                                placeholder="e.g. 2024-05 or Day 1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setGameForm({ ...gameForm, crackDate: 'Day 1' })}
                                                className="px-3 py-2.5 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 text-sm font-medium border border-brand-500/30 rounded-xl transition-colors whitespace-nowrap"
                                            >
                                                Day 1
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Release Date</label>
                                    <input
                                        type="text"
                                        value={gameForm.releaseDate}
                                        onChange={(e) => setGameForm({ ...gameForm, releaseDate: e.target.value })}
                                        className="w-full bg-surface-200 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-brand-500"
                                        placeholder="e.g. 2024-08-30"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <button
                                    type="submit"
                                    disabled={isSubmittingGame}
                                    className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
                                >
                                    {isSubmittingGame ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gamepad2 className="w-5 h-5" />}
                                    Add / Update Game
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
