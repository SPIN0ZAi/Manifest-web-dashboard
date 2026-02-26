export function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-200/50 animate-shimmer">
            <div className="w-4 h-4 bg-white/5 rounded" />
            <div className="flex-1 h-3 bg-white/5 rounded-full" />
            <div className="w-16 h-3 bg-white/5 rounded-full" />
        </div>
    );
}
