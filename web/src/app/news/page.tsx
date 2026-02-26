import { Newspaper, ExternalLink, Clock, MessageSquare, ArrowUpRight } from 'lucide-react';

export const revalidate = 60; // Cache for 60 seconds

async function getDenuvoNews(): Promise<{ news: any[]; error?: string }> {
    try {
        const response = await fetch(
            'https://www.reddit.com/r/CrackWatch/search.json?q=flair_name%3A%22Release%22+Denuvo&restrict_sr=1&sort=new',
            {
                headers: {
                    'User-Agent': `ProjectCairoDenuvoNews/${Math.random().toString(36).substring(7)}`, // Randomize user agent slightly to avoid strict blocking
                },
                next: { revalidate: 60 }
            }
        );

        if (!response.ok) {
            console.error('Failed to fetch from Reddit API:', response.status, response.statusText);
            return { news: [], error: `Reddit API returned ${response.status} ${response.statusText}` };
        }

        const data = await response.json();

        if (!data || !data.data || !data.data.children) {
            console.error('Reddit API returned unexpected JSON format:', data);
            return { news: [], error: 'Reddit API returned an unexpected or rate-limited response format.' };
        }

        const news = data.data.children.map((child: any) => ({
            id: child.data.id,
            title: child.data.title,
            url: child.data.url,
            created_utc: child.data.created_utc,
            permalink: `https://www.reddit.com${child.data.permalink}`,
            thumbnail: child.data.thumbnail,
            score: child.data.score,
            num_comments: child.data.num_comments
        }));

        return { news, error: undefined };
    } catch (error: any) {
        console.error('Error fetching news:', error);
        return { news: [], error: error.message || 'Unknown network error occurred while fetching.' };
    }
}

export default async function NewsPage() {
    const { news, error } = await getDenuvoNews();

    return (
        <div className="min-h-screen bg-surface-50 pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
                            <Newspaper className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white tracking-tight">Crack Status News</h1>
                            <p className="text-gray-400 mt-1">Latest Denuvo and major DRM crack releases</p>
                        </div>
                    </div>
                </div>

                {news.length === 0 ? (
                    <div className="text-center py-20 bg-surface rounded-2xl border border-white/5 mx-auto max-w-2xl">
                        <Newspaper className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-white mb-2">No news available</h2>
                        <p className="text-gray-400 mb-4">Failed to load the latest releases or Reddit is taking a nap.</p>
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl inline-block mt-4">
                                <p className="text-sm text-red-400 font-mono text-left break-all">{error}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {news.map((item: any) => (
                            <a
                                key={item.id}
                                href={item.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group bg-surface hover:bg-surface-100 rounded-2xl border border-white/5 hover:border-brand-500/30 transition-all duration-300 overflow-hidden flex flex-col relative"
                            >
                                <div className="absolute inset-0 bg-gradient-to-t from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="p-6 flex-1 flex flex-col z-10">
                                    <h2 className="text-lg font-semibold text-white group-hover:text-brand-400 transition-colors line-clamp-3 mb-6" title={item.title}>
                                        {item.title}
                                    </h2>

                                    <div className="mt-auto flex items-center justify-between text-sm text-gray-400 font-medium">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-1.5 hover:text-green-400 transition-colors" title="Upvotes">
                                                <ArrowUpRight className="w-4 h-4 text-green-400/70" />
                                                <span>{item.score}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 hover:text-white transition-colors" title="Comments">
                                                <MessageSquare className="w-4 h-4" />
                                                <span>{item.num_comments}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 group-hover:text-brand-400 transition-colors">
                                            <span className="text-xs">{new Date(item.created_utc * 1000).toLocaleDateString()}</span>
                                            <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 -ml-1 transition-all transform group-hover:translate-x-1" />
                                        </div>
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
