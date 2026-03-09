import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search, X, Settings2, RefreshCw, BarChart3,
    Activity, Clock, Save, Check, ChevronDown, ChevronUp,
    TrendingUp, TrendingDown, Zap, AlertTriangle, ArrowUpDown,
    Gauge, Bell, Radio
} from 'lucide-react';
import API_BASE from '../api';

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || 'quant-admin-supersecret-token-777';

const MarketWatchTab = () => {
    const [signals, setSignals] = useState({ all: [], scanning: [], fractals: [], emas: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [saveStatus, setSaveStatus] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'symbol', direction: 'asc' });
    const [notifications, setNotifications] = useState([]);

    // Referencia para comparar estados previos y disparar popups
    const prevSignalsRef = useRef({});

    const [settings, setSettings] = useState({
        symbols: 'ALL',
        is_scanner_active: true,
        is_fractal_active: true,
        fractal_timeframes: 'M5,M15,M30,H1,H4,D1',
        is_ema_active: true,
        ema_timeframes: 'M15,M30,H1,H4',
        is_volume_filter_active: true,
        volume_min_multiplier: 1.5
    });

    const addNotification = (notif) => {
        const id = Date.now();
        setNotifications(prev => [{ ...notif, id }, ...prev].slice(0, 5));
        // Auto-remover después de 8 segundos
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 8000);
    };

    const fetchSignals = async (manual = false) => {
        if (manual) setRefreshing(true);
        try {
            const res = await fetch(`${API_BASE}/api/market-watch/signals/`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            const data = await res.json();

            // Detectar rupturas nuevas para popups
            if (data.all) {
                data.all.forEach(sig => {
                    const prevStatus = prevSignalsRef.current[sig.symbol];
                    if (prevStatus && prevStatus !== sig.breakout_m15 && sig.breakout_m15 !== 'RANGE') {
                        addNotification({
                            symbol: sig.symbol,
                            type: sig.breakout_m15,
                            time: new Date().toLocaleTimeString()
                        });
                    }
                    prevSignalsRef.current[sig.symbol] = sig.breakout_m15;
                });
            }

            setSignals(data);
            setLoading(false);
        } catch { setLoading(false); }
        if (manual) setTimeout(() => setRefreshing(false), 500);
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/market-watch/settings/`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) setSettings(await res.json());
        } catch { }
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        try {
            const res = await fetch(`${API_BASE}/api/market-watch/settings/`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': API_KEY
                },
                body: JSON.stringify(settings)
            });
            setSaveStatus(res.ok ? 'success' : 'error');
            if (res.ok) setTimeout(() => { setSaveStatus(null); setShowSettings(false); }, 1200);
        } catch { setSaveStatus('error'); }
    };

    useEffect(() => {
        fetchSignals(); fetchSettings();
        const interval = setInterval(() => fetchSignals(false), 8000);
        return () => clearInterval(interval);
    }, []);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedSignals = useMemo(() => {
        let items = [...(signals.all || [])].filter(s => s.symbol.toUpperCase().includes(searchTerm));
        if (sortConfig.key) {
            items.sort((a, b) => {
                let vA = a[sortConfig.key];
                let vB = b[sortConfig.key];

                if (sortConfig.key === 'tick_volume') {
                    vA = a.tick_volume || 0;
                    vB = b.tick_volume || 0;
                } else if (sortConfig.key === 'status') {
                    vA = (a.breakout_m15 !== 'RANGE' ? 8 : 0) + (a.fractal_type ? 4 : 0) + (a.ema_signal ? 2 : 0) + (a.stoch_status && a.stoch_status !== 'NEUTRAL' ? 1 : 0);
                    vB = (b.breakout_m15 !== 'RANGE' ? 8 : 0) + (b.fractal_type ? 4 : 0) + (b.ema_signal ? 2 : 0) + (b.stoch_status && b.stoch_status !== 'NEUTRAL' ? 1 : 0);
                }

                if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [signals.all, searchTerm, sortConfig]);

    const getVolumeInfo = (signal) => {
        const vol = signal.tick_volume || 0;
        const ma = signal.volume_ma || 1;
        const ratio = vol / ma;
        const isHigh = ratio >= settings.volume_min_multiplier;
        const percent = Math.min((ratio / 3) * 100, 100);
        return { vol, ma, ratio, isHigh, percent };
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20" />;
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 ml-1 text-brand-accent" /> : <ChevronDown className="w-3 h-3 ml-1 text-brand-accent" />;
    };

    const getStochAlerts = (status) => {
        if (!status || status === 'NEUTRAL') return null;
        const parts = status.split(',');
        return { details: parts };
    };

    return (
        <div className="space-y-4 animate-fade-in pb-20 relative">
            {/* CSS para animaciones específicas */}
            <style>
                {`
                    @keyframes stoch-blink {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.4; transform: scale(0.95); }
                    }
                    @keyframes breakout-pulse {
                        0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(244, 63, 94, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
                    }
                    @keyframes breakout-pulse-green {
                        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                        70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                    }
                    .animate-stoch-blink { animation: stoch-blink 1.5s infinite ease-in-out; }
                    .animate-breakout-red { animation: breakout-pulse 2s infinite; }
                    .animate-breakout-green { animation: breakout-pulse-green 2s infinite; }
                    
                    .stoch-glow-bull {
                        box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
                        background: rgba(16, 185, 129, 0.2);
                        border-color: rgba(16, 185, 129, 0.5);
                    }
                    .stoch-glow-bear {
                        box-shadow: 0 0 12px rgba(244, 63, 94, 0.4);
                        background: rgba(244, 63, 94, 0.2);
                        border-color: rgba(244, 63, 94, 0.5);
                    }
                `}
            </style>

            {/* ═══ Notificaciones Popups ═══ */}
            <div className="fixed top-24 right-5 z-[100] flex flex-col gap-3 pointer-events-none">
                {notifications.map(n => (
                    <div key={n.id} className={`p-4 rounded-2xl border shadow-2xl animate-slide-in pointer-events-auto flex items-center gap-4 min-w-[300px] ${n.type === 'BULLISH_BREAKOUT' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-rose-500/10 border-rose-500/50 text-rose-400'}`}>
                        <div className={`p-2 rounded-full ${n.type === 'BULLISH_BREAKOUT' ? 'bg-emerald-500/20' : 'bg-rose-500/20'}`}>
                            {n.type === 'BULLISH_BREAKOUT' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                            <div className="text-xs font-black uppercase tracking-widest opacity-60">Ruptura M15</div>
                            <div className="text-lg font-black tracking-tighter">{n.symbol}</div>
                            <div className="text-[10px] font-bold uppercase">{n.type === 'BULLISH_BREAKOUT' ? 'Explosión Alcista' : 'Derrumbe Bajista'} • {n.time}</div>
                        </div>
                        <button className="p-1 opacity-40 hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                    </div>
                ))}
            </div>

            {/* ═══ Header ═══ */}
            <div className="flex justify-between items-center bg-dark-card/30 p-4 rounded-2xl border border-dark-border/50">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5 text-brand-accent" />
                        <h2 className="text-xl font-black text-white tracking-tight">Market Watch <span className="text-brand-accent/50 ml-1 text-sm font-medium">Pro Elite</span></h2>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Breakout Engine & Multi-Factor Liquidity</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchSignals(true)} className={`p-2.5 rounded-xl bg-dark-card border border-dark-border active:scale-95 transition-all ${refreshing ? 'border-brand-accent shadow-[0_0_10px_rgba(45,212,191,0.2)]' : 'hover:border-slate-700'}`}>
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-brand-accent' : 'text-slate-400'}`} />
                    </button>
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-2.5 rounded-xl bg-dark-card border border-dark-border active:scale-95 transition-all ${showSettings ? 'border-brand-accent bg-brand-accent/5' : 'hover:border-slate-700'}`}>
                        <Settings2 className={`w-4 h-4 ${showSettings ? 'text-brand-accent' : 'text-slate-400'}`} />
                    </button>
                </div>
            </div>

            {/* Settings Panel Simple */}
            {showSettings && (
                <div className="bg-dark-card border border-brand-accent/30 rounded-2xl p-5 shadow-2xl animate-slide-down">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-tighter mb-4">
                        <Zap className="w-4 h-4 text-brand-accent" /> Configuración Global
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Activos (ALL para todos)</label>
                            <input type="text" className="w-full bg-black/40 border border-dark-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-accent font-mono"
                                value={settings.symbols} onChange={(e) => setSettings({ ...settings, symbols: e.target.value })} />
                        </div>
                        <div className="flex flex-col justify-end">
                            <button onClick={handleSave} className="py-2.5 rounded-xl bg-brand-accent text-white font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2">
                                <Save className="w-4 h-4" /> Guardar Todo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Buscador */}
            <div className="relative max-w-sm mx-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="text" placeholder="Escribe el símbolo..."
                    className="w-full bg-dark-card/50 border border-dark-border rounded-2xl py-3 pl-10 pr-10 text-white text-sm outline-none focus:border-brand-accent/50 focus:bg-dark-card transition-all placeholder:text-slate-600 font-bold"
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value.toUpperCase())} />
                {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/5 rounded-full"><X className="w-3 h-3 text-slate-500" /></button>}
            </div>

            {/* ═══ TABLA TÉCNICA ═══ */}
            <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-black/50 border-b border-dark-border">
                                <th onClick={() => requestSort('symbol')} className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors">
                                    <div className="flex items-center">Activo <SortIcon column="symbol" /></div>
                                </th>
                                <th onClick={() => requestSort('fractal_price')} className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors text-right">
                                    <div className="flex items-center justify-end">Precio / Spread <SortIcon column="fractal_price" /></div>
                                </th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Ruptura M15</th>
                                <th onClick={() => requestSort('tick_volume')} className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors">
                                    <div className="flex items-center">Volumen <SortIcon column="tick_volume" /></div>
                                </th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Stoch / Señal</th>
                                <th className="px-4 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border/30">
                            {loading ? (
                                <tr><td colSpan="6" className="py-20 text-center text-slate-500 font-black uppercase tracking-widest animate-pulse">Sincronizando Operativa...</td></tr>
                            ) : (
                                sortedSignals.map((sig) => {
                                    const { vol, ratio, isHigh, percent } = getVolumeInfo(sig);
                                    const stochAlerts = getStochAlerts(sig.stoch_status);
                                    const isBreakout = sig.breakout_m15 !== 'RANGE';
                                    const isFractal = sig.fractal_type;
                                    const fractalTfCount = sig.matched_tfs ? sig.matched_tfs.length : 0;
                                    const isEMA = sig.ema_signal;
                                    const ema200Status = sig.ema_200_h1_status;

                                    return (
                                        <tr key={sig.symbol} className={`hover:bg-white/[0.02] transition-colors group ${isBreakout ? (sig.breakout_m15.includes('BULL') ? 'bg-emerald-500/[0.03]' : 'bg-rose-500/[0.03]') : ''}`}>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-6 rounded-full ${isBreakout ? (sig.breakout_m15.includes('BULL') ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-700'}`}></div>
                                                    <div>
                                                        <div className="text-sm font-black text-white group-hover:text-brand-accent transition-colors">{sig.symbol}</div>
                                                        <div className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter tracking-widest">REALTIME SYNC</div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 text-right">
                                                <div className="text-sm font-mono font-bold text-slate-200">{parseFloat(sig.fractal_price || 0).toFixed(5)}</div>
                                            </td>

                                            {/* COLUMNA RUPTURA M15 */}
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-2">
                                                    {isBreakout ? (
                                                        <>
                                                            <div className={`w-3 h-3 rounded-full ${sig.breakout_m15 === 'BULLISH_BREAKOUT' ? 'bg-emerald-500 animate-breakout-green' : 'bg-rose-500 animate-breakout-red'}`}></div>
                                                            <span className={`text-[10px] font-black uppercase tracking-tighter ${sig.breakout_m15 === 'BULLISH_BREAKOUT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {sig.breakout_m15 === 'BULLISH_BREAKOUT' ? 'Ruptura Alcista' : 'Ruptura Bajista'}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Radio className="w-3 h-3 text-slate-700" />
                                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest opacity-40">En Rango</span>
                                                        </>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 min-w-[150px]">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between text-[9px] font-black">
                                                        <span className={isHigh ? 'text-amber-400' : 'text-slate-500'}>{vol} v.</span>
                                                        <span className={isHigh ? 'text-amber-500' : 'text-slate-600'}>{ratio.toFixed(1)}x</span>
                                                    </div>
                                                    <div className="h-1 w-full bg-slate-800/50 rounded-full overflow-hidden">
                                                        <div className={`h-full transition-all duration-1000 ${isHigh ? 'bg-amber-500' : 'bg-slate-700'}`} style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-4 py-4">
                                                <div className="flex flex-col items-center gap-1.5">
                                                    {stochAlerts && (
                                                        <div className="flex flex-wrap justify-center gap-1">
                                                            {stochAlerts.details.map(det => {
                                                                const isCross = det.includes('CROSS');
                                                                const isBull = det.includes('BULLISH') || det.includes('OVERSOLD');
                                                                const tf = det.split('_').pop();
                                                                return (
                                                                    <div key={det} className={`px-1 py-0.5 rounded-[4px] text-[8px] font-black border transition-all ${isCross ? (isBull ? 'stoch-glow-bull border-emerald-500 text-emerald-400' : 'stoch-glow-bear border-rose-500 text-rose-400') : (isBull ? 'bg-emerald-500/10 text-emerald-500/80 border-emerald-500/10' : 'bg-rose-500/10 text-rose-500/80 border-rose-500/10')}`}>
                                                                        {isCross ? `X ${tf}` : tf}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    {isFractal && (
                                                        <span className="text-[9px] font-black text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">
                                                            Fractal ({fractalTfCount})
                                                        </span>
                                                    )}
                                                    {isEMA ? (
                                                        <span className={`text-[10px] font-black uppercase ${isEMA === 'BULLISH' ? 'text-emerald-500' : 'text-rose-500'}`}>{isEMA}</span>
                                                    ) : (
                                                        <span className={`text-[9px] font-black uppercase opacity-40 ${ema200Status === 'ABOVE_EMA200' ? 'text-emerald-600' : 'text-rose-600'}`}>H1: {ema200Status === 'ABOVE_EMA200' ? 'ALC' : 'BAJ'}</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Panel de Alertas Recientes */}
            <div className="bg-dark-card/50 border border-dark-border rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-brand-accent animate-swing" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Motor de Rupturas Activo</span>
                </div>
                <div className="text-[9px] font-black text-slate-500 uppercase">Sincronizado vía WebSockets & Django Scan</div>
            </div>
        </div>
    );
};

export default MarketWatchTab;
