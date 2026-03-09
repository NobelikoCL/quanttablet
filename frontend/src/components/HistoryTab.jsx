import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
    History, RefreshCcw, TrendingUp, TrendingDown, Search,
    Calendar, Target, Activity, BarChart3, PieChart,
    ArrowUpRight, ArrowDownRight, Percent, AlertCircle, Download, Zap, ShieldAlert
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
    ReferenceLine, AreaChart, Area
} from 'recharts';
import { SkeletonHistoryTab } from './SkeletonLoader';
import API_BASE from '../api';

const HistoryTab = () => {
    const [history, setHistory] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('month'); // Default a mes para traders pro
    const [searchTerm, setSearchTerm] = useState('');

    const fetchHistoryData = async () => {
        setLoading(true);
        try {
            // Fetch history deals
            const historyRes = await axios.get(`${API_BASE}/api/history/`, {
                params: { period }
            });
            setHistory(historyRes.data);

            // Fetch performance metrics
            const metricsRes = await axios.get(`${API_BASE}/api/history/metrics/`, {
                params: { period }
            });
            setMetrics(metricsRes.data);
        } catch (error) {
            console.error("Error fetching professional history", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistoryData();
    }, [period]);

    const filteredHistory = useMemo(() => history.filter(deal =>
        deal.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        deal.ticket.toString().includes(searchTerm)
    ), [history, searchTerm]);

    // Construir serie de P&L acumulado para el gráfico (solo deals OUT)
    const cumulativePLData = useMemo(() => {
        const outDeals = history.filter(d => d.entry === 'OUT').slice().reverse();
        let cumulative = 0;
        return outDeals.map((deal, i) => {
            cumulative += deal.total;
            return {
                index: i + 1,
                label: deal.symbol,
                profit: deal.total,
                cumulative: parseFloat(cumulative.toFixed(2)),
            };
        });
    }, [history]);

    const exportCSV = () => {
        const headers = ['Ticket', 'Orden', 'Tiempo', 'Símbolo', 'Tipo', 'Entry', 'Volumen', 'Profit', 'Comisión', 'Swap', 'Total'];
        const rows = filteredHistory.map(d => [
            d.ticket, d.order, d.time, d.symbol, d.type, d.entry,
            d.volume, d.profit?.toFixed(2), d.commission?.toFixed(2),
            d.swap?.toFixed(2), d.total?.toFixed(2)
        ]);
        const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `historial_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const periods = [
        { id: 'day', label: 'Hoy', icon: <Calendar className="w-4 h-4" /> },
        { id: 'week', label: 'Semana', icon: <Activity className="w-4 h-4" /> },
        { id: 'month', label: 'Mes', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'year', label: 'Año', icon: <PieChart className="w-4 h-4" /> },
        { id: 'all', label: 'Todo', icon: <History className="w-4 h-4" /> },
    ];

    const StatCard = ({ title, value, subValue, icon, color, trend }) => (
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-2xl relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-${color || 'slate'}-500/5 rounded-full blur-2xl group-hover:bg-${color || 'slate'}-500/10 transition-all`} />
            <div className="flex justify-between items-start relative z-10">
                <div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{title}</p>
                    <h3 className={`text-2xl font-black ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-white'}`}>
                        {value}
                    </h3>
                    {subValue && <p className="text-slate-500 text-[10px] mt-1 font-medium">{subValue}</p>}
                </div>
                {icon && (
                    <div className={`p-3 bg-${color || 'slate'}-500/10 rounded-xl border border-${color || 'slate'}-500/20`}>
                        {React.cloneElement(icon, { className: `w-5 h-5 text-${color || 'slate'}-400` })}
                    </div>
                )}
            </div>
        </div>
    );

    if (loading && history.length === 0) {
        return <SkeletonHistoryTab />;
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header / Period Selector */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white flex items-center gap-3">
                        <History className="w-7 h-7 text-brand-accent" />
                        Historial Profesional
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Análisis profundo de rendimiento MT5</p>
                </div>

                <div className="flex bg-dark-card border border-dark-border p-1 rounded-xl shadow-lg">
                    {periods.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setPeriod(p.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${period === p.id
                                ? 'bg-brand-accent text-white shadow-lg scale-105'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {p.icon}
                            <span className="hidden sm:inline">{p.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Net Profit"
                    value={`$${metrics?.total_net_profit?.toFixed(2) || '0.00'}`}
                    subValue={`Bruto: $${metrics?.gross_profit?.toFixed(2) || '0.00'}`}
                    icon={<TrendingUp />}
                    color="emerald"
                    trend={metrics?.total_net_profit >= 0 ? 'up' : 'down'}
                />
                <StatCard
                    title="Win Rate"
                    value={`${metrics?.win_rate?.toFixed(1) || '0.0'}%`}
                    subValue={`${metrics?.winning_trades || 0} Gan / ${metrics?.losing_trades || 0} Perd`}
                    icon={<Percent />}
                    color="blue"
                />
                <StatCard
                    title="Profit Factor"
                    value={metrics?.profit_factor?.toFixed(2) || '0.00'}
                    subValue={metrics?.profit_factor > 1.5 ? 'Excelente (>1.5)' : metrics?.profit_factor > 1 ? 'Positivo' : 'Bajo'}
                    icon={<Activity />}
                    color="purple"
                />
                <StatCard
                    title="Avg Win / Avg Loss"
                    value={`$${metrics?.avg_win?.toFixed(2) || '0.00'}`}
                    subValue={`Loss: -$${Math.abs(metrics?.avg_loss || 0).toFixed(2)}`}
                    icon={<BarChart3 />}
                    color="amber"
                />
            </div>

            {/* Métricas avanzadas: Sharpe + Max Drawdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-2xl flex items-center gap-4">
                    <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 flex-shrink-0">
                        <Zap className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Sharpe Ratio</p>
                        <h3 className={`text-2xl font-black ${(metrics?.sharpe_ratio || 0) >= 1 ? 'text-cyan-400' : (metrics?.sharpe_ratio || 0) >= 0 ? 'text-white' : 'text-rose-400'}`}>
                            {metrics?.sharpe_ratio?.toFixed(2) || '—'}
                        </h3>
                        <p className="text-slate-500 text-[10px] mt-0.5">
                            {!metrics?.sharpe_ratio ? 'Sin datos suficientes' :
                                metrics.sharpe_ratio >= 2 ? 'Excelente (>2)' :
                                metrics.sharpe_ratio >= 1 ? 'Bueno (>1)' :
                                metrics.sharpe_ratio >= 0 ? 'Aceptable' : 'Negativo'}
                        </p>
                    </div>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-2xl flex items-center gap-4">
                    <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 flex-shrink-0">
                        <ShieldAlert className="w-5 h-5 text-rose-400" />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Max Drawdown</p>
                        <h3 className="text-2xl font-black text-rose-400">
                            {metrics?.max_drawdown_pct ? `-${metrics.max_drawdown_pct.toFixed(1)}%` : '—'}
                        </h3>
                        <p className="text-slate-500 text-[10px] mt-0.5">
                            {metrics?.max_drawdown_usd ? `-$${metrics.max_drawdown_usd.toFixed(2)} USD` : 'Sin datos'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Gráfico P&L Acumulado */}
            {cumulativePLData.length > 1 && (
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-2xl">
                    <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-brand-accent" />
                        P&L Acumulado — {history.filter(d => d.entry === 'OUT').length} operaciones cerradas
                    </h2>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cumulativePLData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="plGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={cumulativePLData[cumulativePLData.length - 1]?.cumulative >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={cumulativePLData[cumulativePLData.length - 1]?.cumulative >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="index" stroke="#64748b" fontSize={10} tickLine={false} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={v => `$${v}`} />
                                <Tooltip
                                    isAnimationActive={false}
                                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: 11 }}
                                    formatter={(val, name) => [`$${val.toFixed(2)}`, name === 'cumulative' ? 'P&L Acum.' : 'Trade']}
                                    labelFormatter={(i) => cumulativePLData[i - 1]?.label || `#${i}`}
                                />
                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                                <Area
                                    type="monotone"
                                    dataKey="cumulative"
                                    stroke={cumulativePLData[cumulativePLData.length - 1]?.cumulative >= 0 ? '#10b981' : '#ef4444'}
                                    strokeWidth={2}
                                    fill="url(#plGradient)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="bg-dark-card border border-dark-border rounded-xl shadow-2xl overflow-hidden">
                {/* Table Filters */}
                <div className="p-6 border-b border-dark-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="bg-brand-accent/10 border border-brand-accent/20 px-3 py-1 rounded-full">
                            <span className="text-brand-accent text-xs font-black uppercase">
                                {history.length} Operaciones
                            </span>
                        </div>
                        <button
                            onClick={fetchHistoryData}
                            disabled={loading}
                            className="text-slate-400 hover:text-white transition-colors"
                            title="Actualizar"
                        >
                            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        {filteredHistory.length > 0 && (
                            <button
                                onClick={exportCSV}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white text-xs font-bold transition-all"
                                title="Exportar CSV"
                            >
                                <Download className="w-3.5 h-3.5" />
                                CSV
                            </button>
                        )}
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Buscar por símbolo o ticket..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-black/40 border border-dark-border rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-accent/50 transition-all font-medium"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/20 text-slate-400 text-[11px] font-black uppercase tracking-widest border-b border-dark-border">
                                <th className="py-4 px-6">Tiempo (Broker)</th>
                                <th className="py-4 px-4">Info Trade</th>
                                <th className="py-4 px-4">Símbolo</th>
                                <th className="py-4 px-4">Tipo / Entrada</th>
                                <th className="py-4 px-4 text-right">Volumen</th>
                                <th className="py-4 px-4 text-right">Profit Neto</th>
                                <th className="py-4 px-6 text-right">Comisión/Swap</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border/50">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="py-32 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <RefreshCcw className="w-10 h-10 text-brand-accent animate-spin opacity-20" />
                                            <span className="text-slate-500 font-bold animate-pulse">Sincronizando con MT5 Terminal...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredHistory.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="py-32 text-center text-slate-500 font-medium">
                                        No se encontraron operaciones en este periodo.
                                    </td>
                                </tr>
                            ) : (
                                filteredHistory.map((deal) => (
                                    <tr key={deal.ticket} className="hover:bg-brand-accent/[0.02] transition-colors group">
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 text-sm font-bold">
                                                    {(deal.time || '').includes(' ') ? deal.time.split(' ')[1] : deal.time}
                                                </span>
                                                <span className="text-slate-500 text-[10px]">
                                                    {(deal.time || '').includes(' ') ? deal.time.split(' ')[0] : ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-400 text-xs font-mono group-hover:text-white transition-colors">#{deal.ticket}</span>
                                                <span className="text-slate-600 text-[10px] uppercase font-bold tracking-tighter">ORD: {deal.order}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-brand-accent/20 rounded-full" />
                                                <span className="text-white font-black tracking-tight">{deal.symbol}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${deal.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                                    {deal.type}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${deal.entry === 'IN' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'}`}>
                                                    {deal.entry}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <span className="text-slate-300 font-mono font-bold">{deal.volume.toFixed(2)}</span>
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-black font-mono ${deal.total >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {deal.total >= 0 ? '+' : ''}${deal.total.toFixed(2)}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    {deal.total >= 0 ? <ArrowUpRight className="w-3 h-3 text-emerald-500" /> : <ArrowDownRight className="w-3 h-3 text-rose-500" />}
                                                    <span className="text-[10px] text-slate-500">Neto</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex flex-col">
                                                <span className="text-slate-400 text-[11px] font-mono">C: ${deal.commission.toFixed(2)}</span>
                                                <span className="text-slate-600 text-[10px] font-mono">S: ${deal.swap.toFixed(2)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default HistoryTab;
