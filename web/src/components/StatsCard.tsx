import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
    label: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    color?: 'brand' | 'green' | 'yellow' | 'red';
}

export function StatsCard({ label, value, icon: Icon, trend, color = 'brand' }: StatsCardProps) {
    const colorMap = {
        brand: 'from-brand-500 to-brand-600',
        green: 'from-green-500 to-emerald-600',
        yellow: 'from-yellow-500 to-orange-600',
        red: 'from-red-500 to-rose-600',
    };

    const bgMap = {
        brand: 'bg-brand-500/10',
        green: 'bg-green-500/10',
        yellow: 'bg-yellow-500/10',
        red: 'bg-red-500/10',
    };

    return (
        <div className="glass-card p-6 animate-fade-in">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400 mb-1">{label}</p>
                    <p className={`text-3xl font-bold bg-gradient-to-r ${colorMap[color]} bg-clip-text text-transparent`}>
                        {typeof value === 'number' ? value.toLocaleString() : value}
                    </p>
                    {trend && (
                        <p className="text-xs text-gray-500 mt-2">{trend}</p>
                    )}
                </div>
                <div className={`p-3 rounded-xl ${bgMap[color]}`}>
                    <Icon className={`w-6 h-6 bg-gradient-to-r ${colorMap[color]} bg-clip-text`} style={{ color: color === 'brand' ? '#6366f1' : color === 'green' ? '#22c55e' : color === 'yellow' ? '#eab308' : '#ef4444' }} />
                </div>
            </div>
        </div>
    );
}
