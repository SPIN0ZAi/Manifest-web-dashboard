export function SkeletonCard() {
    return (
        <div className="rounded-2xl border border-white/5 overflow-hidden bg-surface animate-shimmer">
            {/* Image area */}
            <div className="h-44 w-full bg-white/5" />
            {/* Content */}
            <div className="p-4 space-y-3">
                <div className="h-4 bg-white/5 rounded-full w-3/4" />
                <div className="h-3 bg-white/5 rounded-full w-1/2" />
                <div className="flex gap-2 mt-2">
                    <div className="h-6 w-16 bg-white/5 rounded-lg" />
                    <div className="h-6 w-12 bg-white/5 rounded-lg" />
                </div>
            </div>
        </div>
    );
}
