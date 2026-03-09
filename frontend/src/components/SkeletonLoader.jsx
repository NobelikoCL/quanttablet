import React from 'react';

const pulse = 'animate-pulse bg-slate-700/50 rounded';

export const SkeletonCard = ({ className = '' }) => (
    <div className={`${pulse} h-24 ${className}`} />
);

export const SkeletonMetricsPanel = () => (
    <div className="grid grid-cols-5 gap-2 lg:gap-4 mb-4 lg:mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-4 lg:p-6 space-y-3">
                <div className={`${pulse} w-8 h-8 rounded-xl`} />
                <div className={`${pulse} h-3 w-3/4`} />
                <div className={`${pulse} h-6 w-1/2`} />
            </div>
        ))}
    </div>
);

export const SkeletonChart = () => (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 lg:p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
            <div className={`${pulse} h-6 w-32`} />
            <div className={`${pulse} h-8 w-32 rounded-lg`} />
        </div>
        <div className={`${pulse} h-48 lg:h-64 w-full rounded-lg`} />
    </div>
);

export const SkeletonTable = ({ rows = 4, cols = 6 }) => (
    <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 lg:p-6 shadow-xl">
        <div className={`${pulse} h-6 w-48 mb-4`} />
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex gap-4 items-center py-2 border-b border-[#334155]">
                    {Array.from({ length: cols }).map((_, j) => (
                        <div key={j} className={`${pulse} h-5 flex-1`} style={{ opacity: 1 - j * 0.1 }} />
                    ))}
                </div>
            ))}
        </div>
    </div>
);

export const SkeletonStatCard = () => (
    <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex justify-between">
            <div className={`${pulse} h-4 w-24`} />
            <div className={`${pulse} h-10 w-10 rounded-xl`} />
        </div>
        <div className={`${pulse} h-8 w-32`} />
        <div className={`${pulse} h-3 w-20`} />
    </div>
);

export const SkeletonHistoryTab = () => (
    <div className="space-y-6 animate-fade-in pb-20">
        <div className="flex justify-between items-center">
            <div className={`${pulse} h-8 w-64`} />
            <div className={`${pulse} h-10 w-64 rounded-xl`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
        </div>
        <SkeletonTable rows={6} cols={7} />
    </div>
);
