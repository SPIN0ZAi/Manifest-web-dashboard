import { ShieldCheck, ShieldAlert, Calendar, User, ExternalLink } from 'lucide-react';
import dbConnect from '@/lib/db/mongodb';
import { Game } from '@/lib/db/models/Game';

export const revalidate = 60; // Cache invalidation

export default async function NewsPage() {
    await dbConnect();

    // Fetch games from MongoDB, sort by most recently created/updated
    const news = await Game.find({}).sort({ createdAt: -1 }).lean();

    return (
        <div className="min-h-screen bg-surface-50 pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Denuvo Games Tracker</h1>
                            <p className="text-gray-400 mt-1">Status of popular Denuvo protected games</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {news.map((item: any) => {
                        const isCracked = item.status === 'cracked';
                        const statusColor = isCracked ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30';
                        const badgeBg = isCracked ? 'bg-green-500/10' : 'bg-red-500/10';

                        return (
                            <div
                                key={item.id}
                                className="group bg-surface hover:bg-surface-100 rounded-2xl border border-white/5 transition-all duration-300 overflow-hidden flex flex-col relative"
                            >
                                {/* Thumbnail */}
                                <div className="h-44 w-full relative overflow-hidden bg-surface-200">
                                    <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent z-10" />
                                    {item.image ? (
                                        <img
                                            src={item.image}
                                            alt={item.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : null}

                                    {/* Status Badge */}
                                    <div className={`absolute top-3 right-3 z-20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md border ${badgeBg} ${statusColor}`}>
                                        {item.status}
                                    </div>
                                </div>

                                <div className="p-5 flex-1 flex flex-col z-10">
                                    <h2 className="text-lg font-bold text-white mb-2 line-clamp-2" title={item.title}>
                                        {item.title}
                                    </h2>

                                    <div className="flex flex-col gap-2 mt-2 mb-4">
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <ShieldAlert className="w-4 h-4 text-brand-400" />
                                            <span className="truncate" title={item.drm}>{item.drm}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <Calendar className="w-4 h-4" />
                                            <span>Rel: {item.releaseDate && !isNaN(Date.parse(item.releaseDate)) ? new Date(item.releaseDate).toLocaleDateString() : (item.releaseDate || 'Unknown')}</span>
                                        </div>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between text-sm">
                                        {isCracked ? (
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 text-green-400/80 font-medium">
                                                    <User className="w-4 h-4" />
                                                    <span className="truncate max-w-[120px]" title={item.cracker}>{item.cracker}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-red-400/80 font-medium text-xs uppercase tracking-wide">
                                                Not Cracked Yet
                                            </div>
                                        )}

                                        {item.crackDate && (
                                            <div className="text-xs text-gray-500 font-mono">
                                                {new Date(item.crackDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
