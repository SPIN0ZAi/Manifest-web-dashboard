export function SkeletonCard() {
    return (
        <div className="block group">
            <div className="glass-card-hover overflow-hidden h-full flex flex-col">
                {/* Image Placeholder */}
                <div className="relative aspect-[460/215] bg-surface-200 animate-pulse" />

                {/* Content Placeholder */}
                <div className="p-4 flex flex-col flex-grow">
                    {/* Title */}
                    <div className="h-4 bg-surface-300 rounded animate-pulse w-3/4 mb-4" />

                    {/* Info Row */}
                    <div className="flex items-center justify-between mt-auto">
                        <div className="h-3 bg-surface-200 rounded animate-pulse w-1/4" />
                        <div className="h-3 bg-surface-200 rounded animate-pulse w-1/5" />
                    </div>
                </div>
            </div>
        </div>
    );
}
