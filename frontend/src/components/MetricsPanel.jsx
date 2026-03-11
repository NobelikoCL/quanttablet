import React from 'react';
import { DollarSign, Activity, PieChart, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react';

const MetricsPanel = ({ data = {} }) => {
    const isInDrawdown = data.equity < data.balance_total;

    const cards = [
        {
            label: 'Depósito Inicial (Historial)',
            value: data.initial_deposit,
            icon: DollarSign,
            iconColor: 'text-amber-400',
            iconBg: 'bg-amber-500/10',
            valueColor: 'text-amber-400 font-black'
        },
        {
            label: 'Capital Total (Bal+Cred)',
            value: data.balance_total,
            icon: DollarSign,
            iconColor: 'text-blue-400',
            iconBg: 'bg-blue-500/10',
            valueColor: 'text-white'
        },
        {
            label: 'Equidad Flotante',
            value: data.equity,
            icon: Activity,
            iconColor: isInDrawdown ? 'text-red-400' : 'text-emerald-400',
            iconBg: isInDrawdown ? 'bg-red-500/10' : 'bg-emerald-500/10',
            valueColor: isInDrawdown ? 'text-red-400' : 'text-emerald-400',
            alert: isInDrawdown
        },
        {
            label: 'P/L vs Depósito (USD)',
            value: data.daily_profit_usd,
            isUSD: true,
            icon: (data.daily_profit_usd || 0) >= 0 ? TrendingUp : TrendingDown,
            iconColor: (data.daily_profit_usd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            iconBg: (data.daily_profit_usd || 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
            valueColor: (data.daily_profit_usd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
        },
        {
            label: 'Rendimiento vs Depósito (%)',
            value: data.daily_pl_percent,
            isPercent: true,
            icon: Activity,
            iconColor: (data.daily_pl_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            iconBg: (data.daily_pl_percent || 0) >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',
            valueColor: (data.daily_pl_percent || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
        }
    ];

    return (
        <div className="grid grid-cols-5 gap-2 lg:gap-4 mb-4 lg:mb-8">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <div key={idx} className={`glass group relative overflow-hidden transition-all duration-300 hover:translate-y-[-4px] hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] rounded-2xl p-4 lg:p-6 ${card.alert ? 'border-red-500/30' : ''
                        }`}>
                        {/* Glow effect on hover */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                        <div className="flex flex-col h-full justify-between relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-2 lg:p-3 rounded-xl transition-all duration-300 ${card.iconBg}`}>
                                    <Icon className={`w-4 lg:w-5 h-4 lg:h-5 ${card.iconColor}`} />
                                </div>
                                {card.alert && (
                                    <span className="flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                )}
                            </div>

                            <div>
                                <p className="text-slate-400 font-bold text-[9px] lg:text-xs uppercase tracking-[0.15em] mb-1.5 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                                    {card.label}
                                </p>
                                <h3 className={`text-lg lg:text-2xl font-black tracking-tight transition-all duration-300 group-hover:scale-105 origin-left ${card.valueColor}`}>
                                    {card.isPercent
                                        ? `${(card.value || 0) >= 0 ? '+' : ''}${(card.value || 0).toFixed(2)}%`
                                        : (card.isUSD || !card.isPercent)
                                            ? (card.value || 0).toLocaleString('en-US', { style: 'currency', currency: data.currency || 'USD' })
                                            : (card.value || 0)
                                    }
                                </h3>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MetricsPanel;
